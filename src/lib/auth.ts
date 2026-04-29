import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import bcrypt from 'bcryptjs'
import { db } from './db'

// Google OAuth is gated to existing AgentUser rows: we don't create
// accounts on the fly. New agents still come through the referral
// approval flow which provisions an AgentUser. The Google sign-in is
// purely a friendlier login path for agents who already exist in the
// system - no email/password to remember, no case-mismatch bugs.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? ''

export const authOptions: NextAuthOptions = {
  providers: [
    // ── Admin (Vault) ──────────────────────────────────────────────────
    CredentialsProvider({
      id: 'credentials',
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await db.adminUser.findUnique({
          where: { email: credentials.email.toLowerCase() },
        })
        if (!user) return null

        const valid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!valid) return null

        await db.adminUser.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })

        const role = user.role === 'LICENSING_COORDINATOR' ? 'licensing_coordinator' : 'admin'
        return { id: user.id, email: user.email, name: user.name, role }
      },
    }),

    // ── Agent Portal ───────────────────────────────────────────────────
    CredentialsProvider({
      id: 'agent-credentials',
      name: 'agent-credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        // Case-insensitive match. Same fix we applied across the agent
        // API: stored email casing might not match the typed casing.
        const user = await db.agentUser.findFirst({
          where: { email: { equals: credentials.email, mode: 'insensitive' } },
          include: { profile: true },
        })
        if (!user || !user.passwordHash) return null

        const valid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!valid) return null

        if (user.profile?.status === 'INACTIVE') {
          throw new Error('AccountInactive')
        }

        await db.agentUser.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })

        return {
          id: user.id,
          email: user.email,
          name: user.profile
            ? `${user.profile.firstName} ${user.profile.lastName}`
            : user.email,
          role: 'agent',
          profileId: user.profile?.id ?? null,
          agentCode: user.profile?.agentCode ?? null,
        }
      },
    }),

    // ── Google OAuth (agent portal only) ──────────────────────────────
    // Only registered if env vars are set so dev environments without
    // OAuth credentials don't crash. Renders as a "Sign in with Google"
    // button on /agents/login.
    ...(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET ? [
      GoogleProvider({
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        // Force account chooser every time so an agent on a shared
        // machine can pick the right Google account.
        authorization: { params: { prompt: 'select_account' } },
      }),
    ] : []),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/vault/login',
  },
  // Fix for Next.js 15+ / 16 CSRF cookie validation issues.
  // NextAuth derives cookie security from NEXTAUTH_URL; when that env var is
  // missing or wrong on Vercel the __Host- prefix breaks the CSRF check.
  // Explicitly setting SameSite=lax + secure=false in dev keeps cookies
  // flowing regardless of host detection.
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' },
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' },
    },
    csrfToken: {
      // Drop the __Host- prefix that NextAuth adds when it detects HTTPS —
      // the prefix requires the cookie to be set without a Domain attribute,
      // which breaks when the production URL isn't exactly right.
      name: `next-auth.csrf-token`,
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: false },
    },
  },
  callbacks: {
    // Google sign-in is allowed only if the email already exists in our
    // DB - either as an AdminUser (admin / LC) OR an active AgentUser.
    // We don't auto-provision either flow from a Google identity.
    //
    // Every rejected attempt is logged to SignInAttempt + pinged to the
    // admin Discord channel so we have an immediate audit trail of who
    // tried to get in without authorization.
    async signIn({ user, account }) {
      if (account?.provider !== 'google') return true
      const email = user.email
      if (typeof email !== 'string' || email.length === 0) return false

      // AdminUser table first (admin + licensing coordinator).
      const adminUser = await db.adminUser.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      })
      if (adminUser) return true

      // Then AgentUser. Reject if the linked profile is INACTIVE.
      const agentUser = await db.agentUser.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        include: { profile: { select: { status: true } } },
      })
      if (agentUser && agentUser.profile?.status !== 'INACTIVE') return true

      // Reject + audit. Outcome distinguishes "we have no record at all"
      // from "we deactivated this person on purpose" so an admin scanning
      // the log can tell at a glance which deserves a follow-up.
      const outcome = agentUser ? 'rejected_inactive_agent' : 'rejected_unknown_email'
      // Fire-and-forget so the redirect doesn't wait on Discord/DB.
      // The .catch swallows failures because losing an audit-log row
      // shouldn't block the user-facing redirect.
      logRejectedSignIn(email, outcome).catch(() => {})
      return false
    },

    async jwt({ token, user, account }) {
      // Credentials provider: the authorize() return value is in `user`,
      // already shaped (id/role/profileId/agentCode). Just copy it over.
      if (user && account?.provider !== 'google') {
        token.id = user.id
        token.role = (user as typeof user & { role: string }).role
        token.profileId = (user as typeof user & { profileId?: string | null }).profileId ?? null
        token.agentCode = (user as typeof user & { agentCode?: string | null }).agentCode ?? null
        return token
      }

      // Google provider: signIn() already validated the user exists in
      // one of our two user tables. Look them up again here to populate
      // the token with the same shape the credentials providers produce.
      // AdminUser wins if both rows happen to share an email (rare, but
      // a Vick-the-CEO situation could plausibly have both).
      if (user && account?.provider === 'google' && user.email) {
        const adminUser = await db.adminUser.findFirst({
          where: { email: { equals: user.email, mode: 'insensitive' } },
        })
        if (adminUser) {
          await db.adminUser.update({
            where: { id: adminUser.id },
            data: { lastLoginAt: new Date() },
          })
          token.id = adminUser.id
          token.role = adminUser.role === 'LICENSING_COORDINATOR' ? 'licensing_coordinator' : 'admin'
          token.profileId = null
          token.agentCode = null
          token.email = adminUser.email
          token.name = adminUser.name
          return token
        }

        const agentUser = await db.agentUser.findFirst({
          where: { email: { equals: user.email, mode: 'insensitive' } },
          include: { profile: { select: { id: true, agentCode: true, firstName: true, lastName: true } } },
        })
        if (agentUser) {
          await db.agentUser.update({
            where: { id: agentUser.id },
            data: { lastLoginAt: new Date() },
          })
          token.id = agentUser.id
          token.role = 'agent'
          token.profileId = agentUser.profile?.id ?? null
          token.agentCode = agentUser.profile?.agentCode ?? null
          // Canonical email/name from our DB rather than whatever Google
          // returned, so display text matches the rest of the app.
          token.email = agentUser.email
          if (agentUser.profile) {
            token.name = `${agentUser.profile.firstName} ${agentUser.profile.lastName}`
          }
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as typeof session.user & {
          id: string
          role: string
          profileId: string | null
          agentCode: string | null
        }
        u.id = token.id as string
        u.role = token.role as string
        u.profileId = (token.profileId as string | null) ?? null
        u.agentCode = (token.agentCode as string | null) ?? null
        // Mirror token email/name overrides set during Google sign-in.
        if (token.email) u.email = token.email as string
        if (token.name) u.name = token.name as string
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

// Persist a rejected Google sign-in attempt to the audit log AND ping
// the admin Discord channel. Both writes are best-effort; if either
// fails the user-facing OAuth redirect still completes normally.
async function logRejectedSignIn(email: string, outcome: string) {
  await db.signInAttempt.create({
    data: { email, provider: 'google', outcome },
  })

  // Discord ping for immediate visibility. Skipped if Discord isn't
  // configured (dev environments without bot token).
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_ADMIN_CHANNEL_ID) {
    try {
      const { sendChannelMessage } = await import('./discord')
      const reason = outcome === 'rejected_inactive_agent'
        ? 'agent profile is INACTIVE'
        : 'no AdminUser or AgentUser record matches this email'
      await sendChannelMessage(process.env.DISCORD_ADMIN_CHANNEL_ID, {
        embeds: [{
          title: '⚠️ Unauthorized sign-in attempt',
          description: [
            `**${email}** tried to sign in with Google and was rejected.`,
            '',
            `Reason: ${reason}`,
            '',
            outcome === 'rejected_unknown_email'
              ? '_If this person should have access, add them via the referral approval flow (agent) or the admin user table (admin/LC)._'
              : '_If this person should be reactivated, flip their AgentProfile status from INACTIVE to ACTIVE in /vault/tracker._',
          ].join('\n'),
          color: 0xF59E0B,
          timestamp: new Date().toISOString(),
          footer: { text: 'AFF Concierge · Auth audit' },
        }],
      })
    } catch { /* non-fatal */ }
  }
}

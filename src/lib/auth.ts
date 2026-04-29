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
    // Google sign-in is allowed only if there's already an AgentUser row
    // for that email and the linked AgentProfile is ACTIVE. We don't
    // auto-provision agents from a Google identity (that flow stays
    // gated behind admin/LC referral approval).
    async signIn({ user, account }) {
      if (account?.provider !== 'google') return true
      const email = user.email
      if (typeof email !== 'string' || email.length === 0) return false
      const dbUser = await db.agentUser.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        include: { profile: { select: { status: true } } },
      })
      if (!dbUser) {
        // Caller sees /agents/login?error=AccessDenied. The login page
        // surfaces a friendly "we couldn't find an agent account..."
        // message in response.
        return false
      }
      if (dbUser.profile?.status === 'INACTIVE') return false
      return true
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

      // Google provider: signIn() already validated the user exists. Look
      // up the AgentUser to populate the same fields the credentials path
      // populates, so every downstream consumer (session callback +
      // role-checking endpoints) sees identical token shape.
      if (user && account?.provider === 'google' && user.email) {
        const dbUser = await db.agentUser.findFirst({
          where: { email: { equals: user.email, mode: 'insensitive' } },
          include: { profile: { select: { id: true, agentCode: true, firstName: true, lastName: true } } },
        })
        if (dbUser) {
          await db.agentUser.update({
            where: { id: dbUser.id },
            data: { lastLoginAt: new Date() },
          })
          token.id = dbUser.id
          token.role = 'agent'
          token.profileId = dbUser.profile?.id ?? null
          token.agentCode = dbUser.profile?.agentCode ?? null
          // Use the canonical email and name from our DB rather than
          // whatever Google returned, so display text matches what the
          // rest of the app already shows (referral name, profile, etc).
          token.email = dbUser.email
          if (dbUser.profile) {
            token.name = `${dbUser.profile.firstName} ${dbUser.profile.lastName}`
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

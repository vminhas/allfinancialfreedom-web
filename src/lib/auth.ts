import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from './db'

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

        return { id: user.id, email: user.email, name: user.name, role: 'admin' }
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

        const user = await db.agentUser.findUnique({
          where: { email: credentials.email.toLowerCase() },
          include: { profile: true },
        })
        if (!user || !user.passwordHash) return null

        const valid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!valid) return null

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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as typeof user & { role: string }).role
        token.profileId = (user as typeof user & { profileId?: string | null }).profileId ?? null
        token.agentCode = (user as typeof user & { agentCode?: string | null }).agentCode ?? null
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
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

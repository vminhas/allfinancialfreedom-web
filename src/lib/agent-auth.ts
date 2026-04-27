import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from './db'

export const agentAuthOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
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
          profileId: user.profile?.id ?? null,
          agentCode: user.profile?.agentCode ?? null,
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/agents/login',
  },
  cookies: {
    sessionToken: {
      name: 'agent-next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.profileId = (user as typeof user & { profileId: string | null }).profileId
        token.agentCode = (user as typeof user & { agentCode: string | null }).agentCode
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as typeof session.user & {
          id: string
          profileId: string | null
          agentCode: string | null
        }
        u.id = token.id as string
        u.profileId = token.profileId as string | null
        u.agentCode = token.agentCode as string | null
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

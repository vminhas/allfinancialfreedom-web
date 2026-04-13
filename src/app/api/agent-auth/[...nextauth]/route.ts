import NextAuth from 'next-auth'
import { agentAuthOptions } from '@/lib/agent-auth'

const handler = NextAuth(agentAuthOptions)
export { handler as GET, handler as POST }

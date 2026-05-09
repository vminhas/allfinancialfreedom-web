import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Routes under /agents that anyone can visit unauthenticated. Login,
// invite acceptance, and the two email-confirmation status pages are
// reached from emailed links before the agent has a session, so they
// must stay open. Everything else under /agents is authenticated
// agent-portal content.
const AGENT_PUBLIC_PATHS = new Set([
  '/agents/login',
  '/agents/invite',
  '/agents/email-verify',
  '/agents/email-cancel',
  // Next.js metadata route — fetched by Safari when rendering the
  // login page's icon link tag, must stay anonymously reachable.
  '/agents/apple-icon',
])

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Pass the pathname to server components via a request header
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)

  // ── Vault: staff-only (admin / licensing_coordinator) ──
  if (pathname.startsWith('/vault')) {
    if (pathname === '/vault/login') {
      return NextResponse.next({ request: { headers: requestHeaders } })
    }
    const token = await getToken({
      req: request,
      cookieName: 'next-auth.session-token',
      secret: process.env.NEXTAUTH_SECRET,
    })
    const role = token?.role
    const isStaff = role === 'admin' || role === 'licensing_coordinator'
    if (!token || !isStaff) {
      return NextResponse.redirect(new URL('/vault/login', request.url))
    }
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // ── Agent portal: agent session required, with carve-outs ──
  if (pathname.startsWith('/agents')) {
    if (AGENT_PUBLIC_PATHS.has(pathname)) {
      return NextResponse.next({ request: { headers: requestHeaders } })
    }
    // Admins build preview links that pass ?preview=<token>; the
    // /api/agents/me endpoint validates the token server-side, but
    // the page itself has to load for that fetch to fire. Allow the
    // page through whenever a preview token is present and let the
    // API be the gate. Forged tokens still get 401 from the API.
    if (request.nextUrl.searchParams.has('preview')) {
      return NextResponse.next({ request: { headers: requestHeaders } })
    }
    const token = await getToken({
      req: request,
      cookieName: 'next-auth.session-token',
      secret: process.env.NEXTAUTH_SECRET,
    })
    const role = token?.role
    // Agents see their own portal; admins / coordinators may also
    // legitimately land here when an agent shares a link or when
    // they're switching contexts. Block everyone else.
    const allowed = role === 'agent' || role === 'admin' || role === 'licensing_coordinator'
    if (!token || !allowed) {
      const loginUrl = new URL('/agents/login', request.url)
      // Preserve where they were trying to go so the login page can
      // bounce them back after sign-in.
      if (pathname !== '/agents') {
        loginUrl.searchParams.set('next', pathname)
      }
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: [
    '/vault',
    '/vault/(.*)',
    '/agents',
    '/agents/(.*)',
  ],
}

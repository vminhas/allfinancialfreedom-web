import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Pass the pathname to server components via a request header
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)

  // Login page is always accessible — just forward with the pathname header
  if (pathname === '/vault/login') {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // All other vault routes require an admin session.
  // Must use the same cookie name we set in auth.ts (no __Secure- prefix).
  const token = await getToken({
    req: request,
    cookieName: 'next-auth.session-token',
    secret: process.env.NEXTAUTH_SECRET,
  })
  if (!token || token.role !== 'admin') {
    return NextResponse.redirect(new URL('/vault/login', request.url))
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  // Include /vault/login so middleware runs and sets the x-pathname header
  matcher: ['/vault', '/vault/(.*)'],
}

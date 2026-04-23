import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host') ?? ''

  // www → non-www redirect (301)
  if (host.startsWith('www.')) {
    const url = request.nextUrl.clone()
    url.host = host.replace('www.', '')
    return NextResponse.redirect(url, 301)
  }

  // Pass the pathname to server components via a request header
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)

  // Non-vault routes: just forward with the pathname header
  if (!pathname.startsWith('/vault')) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Login page is always accessible
  if (pathname === '/vault/login') {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // All other vault routes require a staff session
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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|blog/.*\\.jpg|brand/.*).*)'],
}

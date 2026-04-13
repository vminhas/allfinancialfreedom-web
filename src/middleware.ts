import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request })
  // Vault requires an admin session — agents cannot access it
  if (!token || token.role !== 'admin') {
    return NextResponse.redirect(new URL('/vault/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/vault', '/vault/((?!login).*)'],
}

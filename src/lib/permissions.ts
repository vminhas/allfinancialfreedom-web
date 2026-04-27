import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'

export type StaffRole = 'admin' | 'licensing_coordinator'

type StaffSession = Session | null

export function getStaffRole(session: StaffSession): StaffRole | null {
  if (!session?.user) return null
  const role = (session.user as { role?: string }).role
  if (role === 'admin' || role === 'licensing_coordinator') return role
  return null
}

export function isAdmin(session: StaffSession): boolean {
  return getStaffRole(session) === 'admin'
}

export function isLicensingCoordinator(session: StaffSession): boolean {
  return getStaffRole(session) === 'licensing_coordinator'
}

export function isStaff(session: StaffSession): boolean {
  return getStaffRole(session) !== null
}

/**
 * Guard helper. Returns a 401 NextResponse if the session role isn't in the
 * allowed list, or null if the caller should proceed. Usage:
 *
 *   const denied = requireRole(session, 'admin')
 *   if (denied) return denied
 */
export function requireRole(
  session: StaffSession,
  ...allowed: StaffRole[]
): NextResponse | null {
  const role = getStaffRole(session)
  if (!role || !allowed.includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// Single source of truth for the agent-portal "Book a time" page.
// Stored as a JSON-encoded value in the Setting table under the
// BOOKING_LINKS key, so we don't need a dedicated Prisma model just
// to keep a small list of trainers + their Calendly URLs.
//
// Each entry maps one schedulable person (Vick, Melinee, a CFT, the
// licensing coordinator) to their Calendly link. Admins manage the
// list from /vault/settings; agents see it on /agents/book.

import { getSetting, setSetting } from './settings'

export type BookingGroup = 'leadership' | 'trainers' | 'support'

export interface BookingLink {
  id: string                // stable cuid-ish; client-generated when added
  name: string              // "Vick Minhas"
  role: string              // "CEO", "COO · Onboarding Host", "Certified Field Trainer"
  group: BookingGroup
  calendlyUrl: string       // any scheduling URL; we don't validate provider
  description?: string      // optional one-liner shown beneath the role
  // Either an emoji ("✦") or a lucide-react icon name we know how to
  // render on the agent side. Falls back to initials if missing.
  icon?: string
  // Vercel Blob URL of the leadership/trainer's headshot. When set,
  // renders in place of the icon/initials on the agent's Book page,
  // so trainers feel like real humans you're booking with rather
  // than abstract roles. Uploaded via the admin /vault/settings UI.
  avatarUrl?: string
  // Optional link to an existing AFF user (admin or agent profile).
  // When set, the agent-side GET resolves the person's live name +
  // avatar from their record, so updating their profile elsewhere
  // automatically reflects on the Book page. Free-text name +
  // avatarUrl above stay as fallback for non-system entries.
  personType?: 'admin' | 'agent'
  personId?: string
}

const KEY = 'BOOKING_LINKS'

export async function getBookingLinks(): Promise<BookingLink[]> {
  const raw = await getSetting(KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is BookingLink =>
      typeof x === 'object' && x !== null
      && typeof (x as BookingLink).id === 'string'
      && typeof (x as BookingLink).name === 'string'
      && typeof (x as BookingLink).calendlyUrl === 'string'
    )
  } catch {
    return []
  }
}

export async function saveBookingLinks(links: BookingLink[]): Promise<void> {
  await setSetting(KEY, JSON.stringify(links))
}

export const BOOKING_GROUP_LABEL: Record<BookingGroup, string> = {
  leadership: 'Leadership',
  trainers: 'Trainers',
  support: 'Licensing & Support',
}

export const BOOKING_GROUP_ORDER: BookingGroup[] = ['leadership', 'trainers', 'support']

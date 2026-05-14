// Render helpers for DB-driven email templates.
//
// A template stores just the inner body HTML (whatever the admin
// authored in the WYSIWYG editor). At send time we:
//   1. Substitute {{variables}} in subject + body against a context
//      object the caller assembled from the inbound event.
//   2. Wrap the body in the AFF brand shell (gold gradient bars, navy
//      hero, signature, footer) so every email reads as AFF whether
//      Vick, Operations, or Melinee sent it.
//
// Variable syntax is intentionally dumb — `{{name}}` is replaced with
// the string value of context.name. Missing keys render as empty
// strings so a typo doesn't break a send. No conditionals, no loops;
// if a template needs branching we add a new template instead.
//
// Available variables per event type are documented for the editor UI
// via VARS_BY_EVENT below. Keep both in sync when adding new events.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface RenderContext {
  // Anything string-keyed; values get coerced to strings at render
  // time. Pass already-formatted display values (e.g. a date string,
  // not a Date) — the template author shouldn't have to think about
  // formatting.
  [key: string]: string | number | null | undefined
}

const MUSTACHE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

// Apply {{var}} substitution against ctx. Missing keys collapse to ''
// so a malformed template still sends without a "{{firstName}}"
// leaking into the recipient's inbox.
export function substituteVars(text: string, ctx: RenderContext): string {
  return text.replace(MUSTACHE, (_, key) => {
    const v = ctx[key]
    if (v === null || v === undefined) return ''
    return String(v)
  })
}

// Same as substituteVars but the substituted values get HTML-escaped.
// Use for any variable that will land inside an HTML attribute or
// text node (every body variable, basically). For inline HTML you
// want from a variable, use substituteVars + escape on the caller side.
export function substituteVarsHtml(text: string, ctx: RenderContext): string {
  return text.replace(MUSTACHE, (_, key) => {
    const v = ctx[key]
    if (v === null || v === undefined) return ''
    return escapeHtml(String(v))
  })
}

// The variables an editor can use per event. Surface this in the
// /vault/email-templates UI so an author knows what they can type.
// Keep these lowercase + camelCase; the substitution is case-sensitive.
export const VARS_BY_EVENT: Record<string, { name: string; description: string }[]> = {
  AppointmentCreate: [
    { name: 'firstName',       description: "Contact's first name" },
    { name: 'lastName',        description: "Contact's last name" },
    { name: 'email',           description: "Contact's email" },
    { name: 'phone',           description: "Contact's phone" },
    { name: 'appointmentTime', description: 'Formatted appointment date + time' },
    { name: 'rescheduleUrl',   description: 'Link the contact can use to pick a new time' },
    { name: 'licenseType',     description: 'PropHog license type (from local Contact)' },
    { name: 'currentAgency',   description: 'PropHog current agency (from local Contact)' },
    { name: 'state',           description: 'Contact state' },
    { name: 'importFileName',  description: 'PropHog import file name' },
    { name: 'importContext',   description: 'PropHog import context prompt' },
    { name: 'leadType',        description: '"Worn Out (soft touch sequence)" or "Fresh Lead"' },
  ],
  JoinFormSubmitted: [
    { name: 'firstName',  description: "Applicant's first name" },
    { name: 'lastName',   description: "Applicant's last name" },
    { name: 'email',      description: "Applicant's email" },
    { name: 'bookingUrl', description: 'Discovery-call booking link' },
  ],
}

export const EVENT_TYPE_OPTIONS: { value: string; label: string; description: string }[] = [
  {
    value: 'AppointmentCreate',
    label: 'Appointment booked',
    description: 'Fires when a contact books a discovery call (GHL AppointmentCreate webhook).',
  },
  {
    value: 'JoinFormSubmitted',
    label: 'Join form submitted',
    description: 'Fires when someone submits the public Join form on the marketing site.',
  },
]

// Filter spec for a template — keep tiny for now. Only one filter
// shape today: contact has a tag starting with a prefix. Add more
// kinds as concrete needs come up.
export interface TemplateFilter {
  tagStartsWith?: string
}

// Test a filter against a contact-shaped context (tags + customFields
// joined in by the webhook). Null filter = always match.
export function filterMatches(filter: unknown, contactTags: string[]): boolean {
  if (!filter || typeof filter !== 'object') return true
  const f = filter as TemplateFilter
  if (f.tagStartsWith) {
    const prefix = f.tagStartsWith.toLowerCase()
    if (!contactTags.some(t => t.toLowerCase().startsWith(prefix))) return false
  }
  return true
}

export interface ShellInput {
  title: string                // Hero headline. Usually a copy of subject.
  bodyHtml: string             // Inner body, already variable-substituted.
  senderName: string           // "Vick Minhas" — for the closing signature.
  senderRole: string           // "Chief Executive Officer, All Financial Freedom".
  preheader?: string           // Hidden preview line shown in inbox lists.
}

// Wrap a template body in the AFF brand shell. Returns a full HTML
// document body string (no <html> / <head> — GHL conversations API
// expects body fragment HTML).
export function wrapInShell(input: ShellInput): string {
  const hiddenPreheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">${escapeHtml(input.preheader)}</div>`
    : ''

  return `${hiddenPreheader}
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;">
      <div style="height:4px;background:linear-gradient(90deg,#C9A96E,#E8C98A,#C9A96E);"></div>
      <div style="background:#142D48;padding:40px 48px 36px;">
        <p style="color:#C9A96E;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;margin:0 0 10px;font-weight:600;">All Financial Freedom</p>
        <h1 style="color:#ffffff;font-size:26px;font-weight:300;margin:0;line-height:1.25;">${escapeHtml(input.title)}</h1>
      </div>
      <div style="height:1px;background:linear-gradient(90deg,#C9A96E,rgba(201,169,110,0.2));"></div>
      <div style="padding:44px 48px;color:#4B5563;font-size:15px;line-height:1.85;">
        ${input.bodyHtml}
        <p style="color:#4B5563;font-size:15px;line-height:1.6;margin:32px 0 4px;">With appreciation,</p>
        <p style="color:#142D48;font-size:15px;font-weight:700;margin:0 0 2px;">${escapeHtml(input.senderName)}</p>
        <p style="color:#C9A96E;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0;font-weight:500;">${escapeHtml(input.senderRole)}</p>
      </div>
      <div style="height:1px;background:#F0F0F0;margin:0 48px;"></div>
      <div style="padding:20px 48px 28px;">
        <p style="color:#9BB0C4;font-size:11px;margin:0 0 6px;"><strong style="color:#6B8299;">All Financial Freedom</strong> &nbsp;&bull;&nbsp; contact@allfinancialfreedom.com</p>
        <p style="color:#C4D0DB;font-size:10px;margin:0;line-height:1.6;">Licensed insurance professionals. Products and availability vary by state. <a href="https://allfinancialfreedom.com/unsubscribe" style="color:#C4D0DB;text-decoration:none;">Unsubscribe</a></p>
      </div>
      <div style="height:3px;background:linear-gradient(90deg,#C9A96E,#E8C98A,#C9A96E);"></div>
    </div>
  `
}

// Sample data for previewing a template in the editor. Keep these
// realistic but obviously placeholder so an author can spot bugs.
export const PREVIEW_CONTEXT: Record<string, RenderContext> = {
  AppointmentCreate: {
    firstName: 'Caytlin',
    lastName: 'Farmer',
    email: 'caytlinfarmer@example.com',
    phone: '(555) 555-5555',
    appointmentTime: 'Wednesday, May 28, 2026 at 2:30 PM EST',
    rescheduleUrl: 'https://aff.example/reschedule',
    licenseType: 'Life & Health',
    currentAgency: 'Independent',
    state: 'GA',
    leadType: 'Fresh Lead',
  },
  JoinFormSubmitted: {
    firstName: 'Caytlin',
    lastName: 'Farmer',
    email: 'caytlinfarmer@example.com',
    bookingUrl: 'https://aff.example/book',
  },
}

import { NextResponse } from 'next/server'

// Short, memorable redirect to the GoHighLevel booking widget. Centralizes
// the scheduling link so it can be reused across the site, the confirmation
// email, and the PDF guide (as allfinancialfreedom.com/schedule) and
// updated in one place if the booking widget URL ever changes.
const BOOKING_URL = 'https://links.allfinancialfreedom.com/widget/booking/3HMzMq5EEvGABPd1voxY'

export function GET() {
  return NextResponse.redirect(BOOKING_URL, 302)
}

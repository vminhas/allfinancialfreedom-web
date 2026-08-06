// Single source of truth for the annuity lead-pipeline master switch, in a
// dependency-free module so BOTH server code (lead-pipeline.ts + the lead
// routes) and the client form (AnnuityLeadForm.tsx) can import it without
// pulling server-only deps into the browser bundle.
//
// false = the outbound pipeline is OFF because mycadre now owns the annuity
// funnel end to end and we must not double-contact the prospect or double-count
// the pixel. This gates: GoHighLevel contact/tags, the speed-to-lead SMS, the
// confirmation email, the Meta CAPI lead event (server), and the Meta Pixel
// "Lead" event (browser). Flip to `true` to restore the entire pipeline in one
// line.
//
// Deliberately NOT gated by this flag: the local AnnuityLead DB row + TCPA
// consent record (harmless backup), the GA4 generate_lead event (Google
// Ads top-of-funnel, still ours), and the forward of the lead to mycadre.
export const LEADS_PIPELINE_ENABLED = false

// Whether Concierge posts new leads into the staff-only Discord leads channel.
// false = off (mycadre now surfaces leads), so Concierge stops posting them.
// Separate from LEADS_PIPELINE_ENABLED because this is an internal staff
// notification that never contacts the prospect. Flip to `true` to restore.
export const LEAD_DISCORD_NOTIFY_ENABLED = false

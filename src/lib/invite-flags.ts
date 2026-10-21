// Master switch for sending agent portal invites.
//
// false = OFF. Recruiting and onboarding moved to Cadre, so AFF stops
// inviting new agents into this portal. There are four independent invite
// senders (the admin manual invite, the My Team resend, the Tevah auto-invite
// via sendAgentInviteEmail, and referral approval), and all four honor this.
//
// Deliberately NOT gated: accepting an invite. /agents/invite and
// /api/agents/set-password keep working so anyone already holding a valid
// link can finish signing up rather than being stranded mid-flow. This only
// stops NEW invites from going out. Flip to `true` to restore.
export const AGENT_INVITES_ENABLED = false

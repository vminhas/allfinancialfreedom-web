import { db } from './db'

// Bidirectional auto-link between BusinessPartner contact rows and the
// AgentProfile the contact became when they got onboarded. Match key is
// email, case-insensitive. Used from two directions:
//
//   - Agent created (or BP-imported with email): when a new agent gets
//     an AgentUser, sweep every BP row in the system whose email matches
//     and stamp linkedAgentProfileId. Catches the common case where the
//     recruiter logged the contact before the recruit accepted the
//     invite.
//
//   - BP created with email: when a contact lands (manual add, admin
//     hand-off, CSV import), check whether an AgentUser with that email
//     already exists; if so, link the BP immediately. Catches the rarer
//     case where the agent was onboarded first and the recruiter is
//     adding them retroactively.
//
// Failures here should never bring down the create path itself: each
// helper swallows errors and returns 0 / null. The link is a UX nicety,
// not a data-integrity requirement.

export async function autoLinkBusinessPartnersForAgent(
  opts: { agentProfileId: string; email: string | null | undefined },
): Promise<number> {
  if (!opts.email) return 0
  try {
    const result = await db.businessPartner.updateMany({
      where: {
        email: { equals: opts.email, mode: 'insensitive' },
        linkedAgentProfileId: null,
      },
      data: { linkedAgentProfileId: opts.agentProfileId },
    })
    return result.count
  } catch {
    return 0
  }
}

export async function autoLinkAgentForBusinessPartner(
  opts: { businessPartnerId: string; email: string | null | undefined },
): Promise<string | null> {
  if (!opts.email) return null
  try {
    const agentUser = await db.agentUser.findFirst({
      where: { email: { equals: opts.email, mode: 'insensitive' } },
      select: { profile: { select: { id: true } } },
    })
    if (!agentUser?.profile) return null
    await db.businessPartner.update({
      where: { id: opts.businessPartnerId },
      data: { linkedAgentProfileId: agentUser.profile.id },
    })
    return agentUser.profile.id
  } catch {
    return null
  }
}

// Bulk version of the BP→Agent direction for the import path. Looks up
// every email at once rather than issuing N agentUser.findFirst calls.
export async function autoLinkAgentsForBusinessPartners(
  opts: { agentProfileId: string; emails: Array<string | null | undefined> },
): Promise<number> {
  const lowerEmails = opts.emails
    .map(e => e?.trim().toLowerCase())
    .filter((e): e is string => !!e && e.length > 0)
  if (lowerEmails.length === 0) return 0
  try {
    const agentUsers = await db.agentUser.findMany({
      where: { email: { in: lowerEmails, mode: 'insensitive' } },
      select: { email: true, profile: { select: { id: true } } },
    })
    if (agentUsers.length === 0) return 0

    // Build email→profileId map once, then issue one updateMany per
    // distinct profile so we don't loop inside a transaction.
    const byEmail = new Map<string, string>()
    for (const au of agentUsers) {
      if (au.profile) byEmail.set(au.email.toLowerCase(), au.profile.id)
    }

    let total = 0
    for (const [email, profileId] of byEmail.entries()) {
      const r = await db.businessPartner.updateMany({
        where: {
          agentProfileId: opts.agentProfileId,
          email: { equals: email, mode: 'insensitive' },
          linkedAgentProfileId: null,
        },
        data: { linkedAgentProfileId: profileId },
      })
      total += r.count
    }
    return total
  } catch {
    return 0
  }
}

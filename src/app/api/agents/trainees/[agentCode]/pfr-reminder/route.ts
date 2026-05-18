import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveAgentIdentity } from '@/lib/agent-identity'
import { authorizeTeamMemberAccess } from '@/lib/trainer-trainees'
import { createNotification } from '@/lib/notify'

// POST /api/agents/trainees/[agentCode]/pfr-reminder
//
// Nudge a downline / trainee agent who hasn't started their Personal
// Financial Review. Same team-member auth as the contacts drill-down
// (recruiter or assigned trainer). Primary channel is a Discord DM via
// the unified notify helper (which also drops an in-app bell row so
// they catch it in-portal even with no Discord linked). If the agent
// has no Discord on file we additionally fall back to a GHL email.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ agentCode: string }> },
) {
  const id = await resolveAgentIdentity(req)
  if ('error' in id) return id.error

  const { agentCode } = await ctx.params
  const trainee = await authorizeTeamMemberAccess(id.profileId, agentCode)
  if (!trainee) {
    return NextResponse.json(
      { error: "You don't have access to this agent. You need to be their recruiter or assigned trainer." },
      { status: 403 },
    )
  }

  const [target, sender, pfr] = await Promise.all([
    db.agentProfile.findUnique({
      where: { id: trainee.id },
      select: {
        firstName: true,
        discordUserId: true,
        agentUser: { select: { email: true } },
      },
    }),
    db.agentProfile.findUnique({
      where: { id: id.profileId },
      select: { firstName: true, lastName: true, preferredName: true },
    }),
    db.personalFinancialReview.findUnique({
      where: { agentProfileId: trainee.id },
      select: { monthlyIncome: true },
    }),
  ])
  if (!target) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  // Already finished: nothing to nudge. Surface it so the UI can show
  // "already completed" instead of pretending it sent a reminder.
  if (pfr && pfr.monthlyIncome > 0) {
    return NextResponse.json({ ok: true, alreadyDone: true })
  }

  const fromName = sender
    ? `${sender.preferredName?.trim() || sender.firstName} ${sender.lastName}`
    : 'Your upline'

  await createNotification({
    recipientAgentProfileId: trainee.id,
    kind: 'pfr.reminder',
    subjectType: 'pfr',
    title: 'Reminder: complete your Personal Financial Review',
    body: `${fromName} asked you to finish your PFR. It only takes a few minutes and unlocks the next steps in your training.`,
    linkUrl: '/agents/pfr',
    color: 0xc9a96e,
    discord: {
      title: 'Time to complete your PFR',
      description: `${fromName} noticed you haven't started your Personal Financial Review yet. Knock it out here: ${process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'}/agents/pfr`,
      color: 0xc9a96e,
    },
  }).catch(err => console.warn('[pfr-reminder] notify failed:', err))

  // Email fallback only when there's no Discord to DM. Best-effort: we
  // reuse an existing GHL contact and skip silently if GHL isn't
  // configured or the contact doesn't exist. The in-app bell row above
  // already guarantees the agent sees it next time they load the portal.
  let emailSent = false
  if (!target.discordUserId && target.agentUser?.email) {
    try {
      const { getGhlConfig, sendGhlEmail, OPS_MAILBOX } = await import('@/lib/ghl')
      const config = await getGhlConfig()
      if (config.apiKey && config.locationId) {
        const searchRes = await fetch(
          `https://services.leadconnectorhq.com/contacts/search?locationId=${config.locationId}&query=${encodeURIComponent(target.agentUser.email)}`,
          { headers: { Authorization: `Bearer ${config.apiKey}`, Version: '2021-07-28' } },
        )
        const searchData = await searchRes.json() as { contacts?: { id: string }[] }
        const ghlContactId = searchData.contacts?.[0]?.id
        if (ghlContactId) {
          const portalUrl = `${process.env.NEXTAUTH_URL ?? 'https://allfinancialfreedom.com'}/agents/pfr`
          const html = `
            <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
              <p>Hi ${target.firstName},</p>
              <p>${fromName} asked you to complete your Personal Financial Review (PFR). It only takes a few minutes and unlocks the next steps in your training.</p>
              <p><a href="${portalUrl}" style="display:inline-block;background:#C9A96E;color:#0A1628;text-decoration:none;padding:12px 22px;border-radius:4px;font-weight:700;">Open your PFR</a></p>
              <p style="color:#6B7280;font-size:13px;">All Financial Freedom</p>
            </div>`
          const msgRes = await sendGhlEmail({
            contactId: ghlContactId,
            emailTo: target.agentUser.email,
            subject: 'Reminder: complete your Personal Financial Review',
            html,
            config,
            emailFrom: OPS_MAILBOX.email,
            emailFromName: OPS_MAILBOX.name,
          })
          emailSent = msgRes.ok
        }
      }
    } catch (err) {
      console.warn('[pfr-reminder] email fallback failed:', err)
    }
  }

  return NextResponse.json({
    ok: true,
    channel: target.discordUserId ? 'discord' : (emailSent ? 'email' : 'in_app'),
  })
}

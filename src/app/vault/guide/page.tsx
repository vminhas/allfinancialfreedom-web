'use client'

import { GuideSection, GuideStep, GuideTip } from '@/components/GuideSection'
import {
  BarChart3, Users, ClipboardCheck, Settings, Calendar, Phone,
  Target, Shield, UserPlus, Link2, Cake, Layout,
} from 'lucide-react'

export default function VaultGuidePage() {
  return (
    <div style={{ padding: '24px 32px', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 6 }}>
          Admin Training Guide
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', margin: 0 }}>
          Vault Operations Manual
        </h1>
        <p style={{ fontSize: 13, color: '#6B8299', marginTop: 6, lineHeight: 1.6 }}>
          This guide covers every section of the AFF Vault. Use it as a reference for managing agents, processing licensing, and overseeing the platform.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <GuideSection title="Dashboard Overview" icon={Layout} defaultOpen>
          <p>The dashboard is your command center. It shows an overview of outreach activity, email volumes, and system health.</p>
          <GuideTip>Check the dashboard daily to monitor outreach performance and spot any issues with email delivery.</GuideTip>
        </GuideSection>

        <GuideSection title="AFF Tracker" icon={Target}>
          <p style={{ marginBottom: 12 }}>The AFF Tracker is your primary tool for managing agents through the 5-phase progression system.</p>

          <GuideStep number={1} title="Agent Table">
            Filter agents by phase, status (Active/Inactive), or trainer. Each row shows the agent&apos;s phase progress, carrier appointments, and last login. Click any row to open the agent drawer.
          </GuideStep>

          <GuideStep number={2} title="Agent Drawer">
            The drawer has 6 tabs: <strong style={{ color: '#ffffff' }}>Info</strong> (overview + stats), <strong style={{ color: '#ffffff' }}>Edit</strong> (update profile fields), <strong style={{ color: '#ffffff' }}>Progress</strong> (phase checklist with grouped items), <strong style={{ color: '#ffffff' }}>Carriers</strong> (appointment status per carrier), <strong style={{ color: '#ffffff' }}>Notes</strong> (admin-only notes), and <strong style={{ color: '#ffffff' }}>Calls</strong> (call log + reviews).
          </GuideStep>

          <GuideStep number={3} title="Phase Advancement">
            When all items in an agent&apos;s current phase are complete, a gold &quot;Ready to promote&quot; badge appears on their row. Click it to open the drawer and use the Promote button. Promotion triggers: Discord role assignment, congratulations DM, announcement post, and seeds the next phase&apos;s checklist items.
          </GuideStep>

          <GuideStep number={4} title="Toggling Checklist Items">
            In the Progress tab, click any item to toggle it complete/incomplete. Items are grouped by category with completion counts. You can toggle items on any phase, not just the agent&apos;s current phase.
          </GuideStep>

          <GuideTip>Use the phase sub-tabs to check items across phases. Agents work asynchronously, so some Phase 2 items might be done before Phase 1 is fully complete.</GuideTip>
        </GuideSection>

        <GuideSection title="Licensing Inbox" icon={ClipboardCheck}>
          <p style={{ marginBottom: 12 }}>The Licensing Inbox has three tabs: Inbox (coordinator requests), Agents (licensing overview), and Referrals (agent referral approvals).</p>

          <GuideStep number={1} title="Inbox Tab">
            When an agent requests help with a licensing item, it appears here. Assign requests to a coordinator, update status to In Progress, and mark Resolved with a note when done. The agent sees the status update in their portal.
          </GuideStep>

          <GuideStep number={2} title="Referrals Tab">
            When an agent refers someone to join AFF, the referral appears here as Pending. Review the referral details, optionally assign a trainer, then Approve or Reject. Approving creates the new agent account, sends a portal invite email with Discord link, and links them to the referring agent.
          </GuideStep>

          <GuideTip>Respond to licensing requests within 24 hours. Agents see &quot;Pending&quot; or &quot;In Progress&quot; in their coordinator panel, so timely updates build trust.</GuideTip>
        </GuideSection>

        <GuideSection title="Setup Dashboard" icon={Link2}>
          <p style={{ marginBottom: 12 }}>The Setup Dashboard manages resource links that appear throughout the agent portal (scripts, training materials, tools).</p>

          <GuideStep number={1} title="Adding Resources">
            Click &quot;+ Add Resource&quot; and fill in the key (unique identifier), label, URL, and category. Suggested resources appear as quick-add buttons if they haven&apos;t been configured yet.
          </GuideStep>

          <GuideStep number={2} title="When to Update">
            Update links when: a Google Drive URL changes, a new training video is published, a provider portal URL updates, or you add new scripts. Changes appear immediately in agent portals.
          </GuideStep>

          <GuideTip>Resource links power the &quot;View scripts&quot;, &quot;Join Fast Start&quot;, and other action buttons in the agent checklist. If a link isn&apos;t configured, the button won&apos;t appear.</GuideTip>
        </GuideSection>

        <GuideSection title="Training Events" icon={Calendar}>
          <GuideStep number={1} title="Sync Pipeline">
            Training events sync hourly from Google Drive. Upload a flyer image and event data to the shared Drive folder. The system parses it with AI and creates Discord events automatically.
          </GuideStep>

          <GuideStep number={2} title="Publishing">
            New events start unpublished. Toggle the publish switch to make them visible. Published events get Discord scheduled events and T-15 minute reminders with the flyer image.
          </GuideStep>

          <GuideStep number={3} title="Manual Events">
            Create events directly from the Trainings page if you don&apos;t want to use the Drive sync. Fill in title, date, Zoom link, and optionally upload a flyer.
          </GuideStep>
        </GuideSection>

        <GuideSection title="Call Review" icon={Phone}>
          <GuideStep number={1} title="Scoring Calls">
            Open a call log, paste the transcript, and score across 5 categories. Each category gets a 1-5 rating. The system calculates an overall score.
          </GuideStep>

          <GuideStep number={2} title="Coaching Flags">
            Flag calls that need coaching discussion. Flagged calls show up in the agent&apos;s call tab and in the tracker drawer. Mark them as &quot;Discussed&quot; after your coaching conversation.
          </GuideStep>
        </GuideSection>

        <GuideSection title="Agent Management" icon={UserPlus}>
          <GuideStep number={1} title="Creating Agents Manually">
            Click &quot;+ Add Agent&quot; in the Tracker or Licensing Inbox. Fill in first name, last name, email, and agent code. The system seeds Phase 1 items and all carrier appointments.
          </GuideStep>

          <GuideStep number={2} title="Sending Invites">
            After creating an agent, send them an invite from the agent drawer. The invite email contains a portal setup link (expires in 72 hours) and is sent via GHL.
          </GuideStep>

          <GuideStep number={3} title="Carrier Appointments">
            Manage carrier status per agent in the Carriers tab of the agent drawer. Update status (Not Started, Pending, Appointed, JIT), writing code, SureLC date, and notes.
          </GuideStep>
        </GuideSection>

        <GuideSection title="Settings & Team" icon={Settings}>
          <GuideStep number={1} title="GHL Configuration">
            Enter your GoHighLevel API key and location ID. These power email sending for invites, outreach, and agent reminders.
          </GuideStep>

          <GuideStep number={2} title="Team Management">
            Add admin and licensing coordinator accounts. Licensing coordinators only see the Licensing Inbox and Setup Dashboard. Admins see everything.
          </GuideStep>
        </GuideSection>

        <GuideSection title="Other Tools" icon={BarChart3}>
          <p><strong style={{ color: '#ffffff' }}>Pipeline</strong> — Visual funnel of outreach prospects by stage.</p>
          <p><strong style={{ color: '#ffffff' }}>Sequences</strong> — Email drip campaigns for outreach.</p>
          <p><strong style={{ color: '#ffffff' }}>Contacts</strong> — CRM contact database for outreach prospects.</p>
          <p><strong style={{ color: '#ffffff' }}>Birthdays</strong> — Upcoming agent birthdays with celebration tracking.</p>
        </GuideSection>
      </div>
    </div>
  )
}

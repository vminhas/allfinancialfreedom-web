'use client'

import { useRouter } from 'next/navigation'
import { GuideSection, GuideStep, GuideTip } from '@/components/GuideSection'
import {
  CheckCircle, ClipboardCheck, Target, Users, FileText, Phone,
  BookOpen, User, BarChart3, Sparkles, Shield,
} from 'lucide-react'

export default function AgentGuidePage() {
  const router = useRouter()

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', color: '#ffffff', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ padding: '20px 32px', borderBottom: '1px solid rgba(201,169,110,0.1)' }}>
        <button onClick={() => router.push('/agents')} style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 4 }}>
          ← Back to Portal
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Agent Portal Guide</h1>
        <p style={{ fontSize: 13, color: '#6B8299', marginTop: 6, lineHeight: 1.6 }}>
          Everything you need to know to get the most out of your AFF agent portal. Use this guide as you work through your phases.
        </p>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

        <GuideSection title="Getting Started" icon={Sparkles} defaultOpen>
          <GuideStep number={1} title="Accept Your Invite">
            You received an email with a link to set up your portal. Click the link and create your password. The link expires in 72 hours. If it expired, ask your trainer or coordinator to resend it.
          </GuideStep>

          <GuideStep number={2} title="Connect Discord">
            Join the AFF Discord server for training channels, weekly reminders, and team resources. You can connect from the Account Setup section of your checklist. Once connected, you&apos;ll get access to your phase-specific training channels.
          </GuideStep>

          <GuideStep number={3} title="Meet Your Trainer">
            Your assigned trainer (CFT) is shown at the top of relevant checklist groups. They guide you through onboarding, field training appointments, and your first client meetings.
          </GuideStep>

          <GuideTip>Your portal auto-saves everything. You never need to click a &quot;save&quot; button on the checklist, PFR, or partner forms.</GuideTip>
        </GuideSection>

        <GuideSection title="System Checklist — Your Roadmap" icon={CheckCircle}>
          <p style={{ marginBottom: 12 }}>The checklist is your home base. It shows everything you need to complete in your current phase and tracks your progress across all 5 phases.</p>

          <GuideStep number={1} title="Understanding Phases">
            <strong style={{ color: '#ffffff' }}>Phase 1</strong> (Getting Started) — Onboarding, licensing, and training prep. <strong style={{ color: '#ffffff' }}>Phase 2</strong> (Field Training) — 10 FTAs, first clients, first $1,000. <strong style={{ color: '#ffffff' }}>Phase 3</strong> (Becoming a CFT) — Sign-offs, independent skills, product mastery. <strong style={{ color: '#ffffff' }}>Phase 4</strong> (MD Focus) — 45K points, team of 5. <strong style={{ color: '#ffffff' }}>Phase 5</strong> (EMD Focus) — 150K points, 20 licensed agents.
          </GuideStep>

          <GuideStep number={2} title="Groups & Collapsing">
            Items are organized into groups (Onboarding Academy, Licensing, Training Prep, etc.). Click a group header to collapse or expand it. Use &quot;Expand All&quot; and &quot;Collapse All&quot; for a quick overview.
          </GuideStep>

          <GuideStep number={3} title="Completing Items">
            Click the <strong style={{ color: '#ffffff' }}>checkbox</strong> to mark an item complete. Click <strong style={{ color: '#ffffff' }}>anywhere else</strong> on the card to expand the description and see details, coaching tips, or action buttons.
          </GuideStep>

          <GuideStep number={4} title="Action Buttons">
            Some items have gold action buttons: &quot;Open PFR&quot; takes you to the financial review tool, &quot;Log this FTA&quot; opens the field training form, &quot;View scripts&quot; links to training materials, and &quot;Refer an agent&quot; takes you to the Partners tab.
          </GuideStep>
        </GuideSection>

        <GuideSection title="Licensing & Compliance" icon={ClipboardCheck}>
          <p style={{ marginBottom: 12 }}>The Licensing Coordinator panel in Phase 1 consolidates all your licensing tasks and lets you request help directly.</p>

          <GuideStep number={1} title="The Coordinator Panel">
            Under the &quot;Licensing &amp; Compliance&quot; group, you&apos;ll see a panel listing all 7 licensing items with their current status. Each item shows whether it&apos;s complete, pending, in progress, or needs your action.
          </GuideStep>

          <GuideStep number={2} title="Requesting Help">
            Click &quot;Request Help&quot; on any item. A pre-written message is ready to send. Edit it if you want to add details, then hit Send. The coordinator will get your request and update you.
          </GuideStep>

          <GuideStep number={3} title="Tracking Status">
            Once submitted, you&apos;ll see &quot;Pending&quot;, &quot;In Progress&quot;, or &quot;Resolved&quot; next to each item. You don&apos;t need to follow up unless the status hasn&apos;t changed in a few days.
          </GuideStep>
        </GuideSection>

        <GuideSection title="Personal Financial Review" icon={BarChart3}>
          <p style={{ marginBottom: 12 }}>The PFR is an interactive financial planning tool you complete with your trainer. It helps you understand your own finances and experience the tool you&apos;ll use with clients.</p>

          <GuideStep number={1} title="Fill It Out Together">
            Open the PFR from your Phase 1 checklist (click &quot;Open PFR&quot;). Sit down with your trainer and walk through each section: income, expenses, assets, debts, and the 4-bucket breakdown.
          </GuideStep>

          <GuideStep number={2} title="Charts & Calculations">
            The PFR automatically calculates your D.I.M.E. insurable need, shows a budget breakdown donut chart, top expenses bar chart, and assets vs debt comparison. These update in real time as you type.
          </GuideStep>

          <GuideStep number={3} title="Dreams & Goals">
            At the bottom, add your financial dreams with time frames and reasons. This is your personal vision board within the portal.
          </GuideStep>

          <GuideTip>Everything auto-saves. Your trainer can also view your PFR from the vault to review it before your meeting.</GuideTip>
        </GuideSection>

        <GuideSection title="Field Training Appointments" icon={Target}>
          <p style={{ marginBottom: 12 }}>Complete 10 live FTAs with your trainer. Each one builds on the last, from observation to full independence.</p>

          <GuideStep number={1} title="Logging an FTA">
            Click &quot;Log this FTA&quot; on any training item. Enter the contact&apos;s name, phone, time zone, age, whether they&apos;re married, have children, are a homeowner, their occupation, appointment date, and any notes about how it went.
          </GuideStep>

          <GuideStep number={2} title="The Progression">
            FTA 1: you observe while your trainer leads. By FTA 5: you&apos;re presenting about half the appointment. By FTA 10: you run the entire appointment solo. Each FTA card has a unique coaching tip.
          </GuideStep>

          <GuideStep number={3} title="Contacts">
            Every FTA you log creates a contact in your Partners tab under the &quot;FTA Contact&quot; category. You can filter and review all your training contacts there.
          </GuideStep>
        </GuideSection>

        <GuideSection title="Partners Tab" icon={Users}>
          <GuideStep number={1} title="Refer a New Agent">
            Submit someone to join your team. Fill in their first name, last name, email, phone, and state. The coordinator reviews your referral and sends them a portal invite with Discord access. You can track the status (Pending, Approved, Rejected).
          </GuideStep>

          <GuideStep number={2} title="Contacts & Prospects">
            This is your personal CRM. Log everyone you meet: business partners, life market prospects (age 28-50), rollover market prospects (age 50+), and recruits. Filter by category using the tabs above the table.
          </GuideStep>

          <GuideStep number={3} title="Full Contact Details">
            Each contact stores: name, email, phone, time zone, age, married/children/homeowner status, occupation, character traits, appointment date, 1st and 2nd call dates, booked status, and notes. Click Edit to update any contact.
          </GuideStep>
        </GuideSection>

        <GuideSection title="Carriers" icon={Shield}>
          <p style={{ marginBottom: 12 }}>The Carriers tab shows your appointment status with each insurance carrier. This is managed by your coordinator and updates automatically.</p>
          <p>Carriers unlock as you advance through phases. Phase 2 carriers (ANICO, Augustar, Corebridge, Foresters, Mutual of Omaha) are available first. Phase 3-5 carriers unlock as you progress.</p>
          <p>Status types: <strong style={{ color: '#4B5563' }}>Not Started</strong>, <strong style={{ color: '#f59e0b' }}>Pending</strong>, <strong style={{ color: '#4ade80' }}>Appointed</strong>, <strong style={{ color: '#9B6DFF' }}>JIT</strong> (Just In Time).</p>
        </GuideSection>

        <GuideSection title="Policies" icon={FileText}>
          <p style={{ marginBottom: 12 }}>Log each client case with the carrier, product, target premium, and submission date. Your policies feed into your phase progress and milestone tracking (first $1,000, 45K points, etc.).</p>
          <GuideTip>Log every case immediately after submission. Keeping your policy tracker current helps your trainer and the system track your production milestones accurately.</GuideTip>
        </GuideSection>

        <GuideSection title="Calls" icon={Phone}>
          <p style={{ marginBottom: 12 }}>Log your client and recruiting calls with notes. If your calls are recorded via Fathom or another tool, paste the transcript for your trainer to review and score.</p>
          <p>Scored calls show ratings across 5 categories. If a call is flagged for coaching, your trainer will discuss it with you during your next meeting.</p>
        </GuideSection>

        <GuideSection title="Resources" icon={BookOpen}>
          <p style={{ marginBottom: 12 }}>The Resources tab contains curated training materials organized by category: Training Videos, Book List, Training &amp; Company, and Tools &amp; Apps. All links are managed by your admin team and stay current.</p>
          <GuideTip>Start with the product videos (IUL, Fixed Index Annuity, Million Dollar Baby) and the top books (Rich Dad Poor Dad, Think &amp; Grow Rich, Money Wealth Life Insurance). These give you the foundation for client conversations.</GuideTip>
        </GuideSection>

        <GuideSection title="Your Profile" icon={User}>
          <GuideStep number={1} title="Update Your Info">
            Go to the Profile tab to update your phone, state, and date of birth. Your name, email, and agent code are set by your admin and can&apos;t be changed from here.
          </GuideStep>

          <GuideStep number={2} title="Upload a Photo">
            Add a professional headshot for your profile. This shows up in the team directory and your agent card.
          </GuideStep>

          <GuideStep number={3} title="Connect Discord">
            If you haven&apos;t connected yet, you can do it from the Profile tab or from the Account Setup checklist item. Connecting gives you access to phase-specific training channels.
          </GuideStep>
        </GuideSection>
      </div>
    </div>
  )
}

'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  PHASE_LABELS, PHASE_ITEMS, PHASE_GROUPS, CARRIERS,
  CARRIER_UNLOCK_PHASE, LICENSING_CHECKLIST, SYSTEM_PROGRESSIONS, PHASE_EXPECTED_DAYS,
  US_STATES, LC_CALENDAR_URL,
} from '@/lib/agent-constants'
import { GROUP_ICONS, PROGRESSION_ICONS, Mail, ChevronDown, ArrowRight, ExternalLink, UserCheck } from '@/lib/checklist-icons'
import { Trophy, Users, BookOpen, Folder, CalendarDays, LogOut, Menu, X, type LucideIcon } from 'lucide-react'
import { formatPhoneAsTyped } from '@/lib/contact-validation'
import CallReviewModal, { CallReviewData } from '@/components/CallReviewModal'
import ClimbTab from '@/components/climb/ClimbTab'
import ContestBanner from '@/components/ContestBanner'
import DatePicker from '@/components/DatePicker'
import DateTimePicker from '@/components/DateTimePicker'
import Spinner from '@/components/Spinner'
import LicensingRequestModal, { type LicensingRequestTopic } from '@/components/LicensingRequestModal'
import RecruitClaimModal from '@/components/RecruitClaimModal'
import NotificationCenter from '@/components/NotificationCenter'
import ClientReminderTogglesCard from '@/components/ClientReminderTogglesCard'
import LicensingCoordinatorPanel from '@/components/LicensingCoordinatorPanel'
import FTALogModal from '@/components/FTALogModal'
import FeedbackButton from '@/components/FeedbackButton'
import NewBusinessTab from '@/components/NewBusinessTab'
import FtaTab from '@/components/FtaTab'
import { AgentTradingCardModal } from '@/components/AgentTradingCard'
import VipPortalWelcome from '@/components/VipPortalWelcome'
import { CallButton, EmailButton } from '@/components/ContactActions'
import { MILESTONE_BY_KEY, isSubmittable } from '@/lib/milestones'
import { displayFirstName, displayFullName } from '@/lib/display-name'
import MarkdownDescription from '@/components/MarkdownDescription'
import ChecklistItemVideo from '@/components/ChecklistItemVideo'
import AnnouncementBanner from '@/components/AnnouncementBanner'
import ContactNotesThread from '@/components/ContactNotesThread'
import { PHASE_COLORS } from '@/lib/phase-colors'
import { useIsMobile } from '@/lib/useIsMobile'

interface PhaseProgress { phase: number; total: number; completed: number; pct: number }
interface PhaseItem {
  phase: number
  itemKey: string
  completed: boolean
  completedAt: string | null
  // Set on direct_1/2/3 items when the recruiter claimed an existing
  // agent. Drives the "Linked to: X" chip + means the picker should
  // skip this person on other slots.
  linkedAgentProfileId?: string | null
  linkedAgentProfile?: {
    id: string
    firstName: string
    lastName: string
    agentCode: string
    status: 'ACTIVE' | 'INACTIVE'
    avatarUrl: string | null
  } | null
}
interface CarrierAppointment { carrier: string; status: string; producerNumber: string | null }
interface Milestone {
  milestone: string
  status: 'PENDING_REVIEW' | 'AWARDED' | 'REJECTED'
  requestedAt: string | null
  requestNote: string | null
  reviewedAt: string | null
  reviewNote: string | null
  completedAt: string
}

interface SlotDef {
  id: string
  label: string
  slotType: 'business_partner' | 'field_appointment'
  sortOrder: number
  phaseItemDefinitionId: string
}

interface SlotFulfillment {
  slotDefId: string
  slotDef: SlotDef
  businessPartner: { id: string; name: string } | null
  fta: { id: string; name: string; appointmentDate: string } | null
  fulfilledAt: string
}

interface AgentData {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  preferredName: string | null
  state: string | null
  phone: string | null
  dateOfBirth: string | null
  avatarUrl: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  zip: string | null
  country: string | null
  ssnMasked: string | null
  ssnOnFile: boolean
  email: string
  phase: number
  phaseLabel: { title: string; standard: string; goal: string; description: string; nextStep: string }
  phaseStartedAt: string | null
  status: string
  goal: string | null
  cft: string | null
  badges: string[]
  discordUserId: string | null
  discordRoleName: string | null
  icaDate: string | null
  licenseNumber: string | null
  npn: string | null
  allPhaseProgress: PhaseProgress[]
  phaseItems: PhaseItem[]
  slotFulfillments: SlotFulfillment[]
  carrierAppointments: CarrierAppointment[]
  selectedCarriers: string[]
  milestones: Milestone[]
  completedFtas: {
    id: string
    name: string
    appointmentDate: string
    completedAt: string | null
    notes: string | null
    businessPartner: { id: string; name: string } | null
  }[]
  counts: { businessPartners: number; callLogs: number }
}

// ── ItemSlots ─────────────────────────────────────────────────────────────────
// Renders the milestone slots for a checklist item. Each slot is a named
// placeholder the agent fills by linking a BP or FTA from their tracker.
function ItemSlots({ itemKey, slots, fulfillments, onFulfillmentChange }: {
  itemKey: string
  slots: SlotDef[]
  fulfillments: SlotFulfillment[]
  onFulfillmentChange: () => void
}) {
  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null)
  const [pickerRecords, setPickerRecords] = useState<{ id: string; name: string; sub?: string }[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const openPicker = async (slot: SlotDef) => {
    setPickerSlotId(slot.id)
    setPickerLoading(true)
    const r = await fetch(`/api/agents/tracker-records?type=${slot.slotType}`)
    const d = r.ok ? await r.json() as { records: Array<{ id: string; name: string; category?: string; appointmentDate?: string; businessPartner?: { name: string } | null }> } : { records: [] }
    setPickerRecords(d.records.map(rec => ({
      id: rec.id,
      name: rec.businessPartner?.name ?? rec.name,
      sub: rec.appointmentDate ? new Date(rec.appointmentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : rec.category ?? undefined,
    })))
    setPickerLoading(false)
  }

  const linkRecord = async (slot: SlotDef, recordId: string) => {
    setSaving(slot.id)
    await fetch('/api/agents/slot-fulfillment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slot.slotType === 'business_partner' ? { slotDefId: slot.id, businessPartnerId: recordId } : { slotDefId: slot.id, ftaId: recordId }),
    })
    setSaving(null)
    setPickerSlotId(null)
    onFulfillmentChange()
  }

  const unlinkRecord = async (slot: SlotDef) => {
    setSaving(slot.id)
    await fetch(`/api/agents/slot-fulfillment?slotDefId=${slot.id}`, { method: 'DELETE' })
    setSaving(null)
    onFulfillmentChange()
  }

  // Sort slots by sortOrder
  const sorted = [...slots].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed rgba(155,109,255,0.2)' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#9B6DFF', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
        Required · {sorted.filter(s => fulfillments.some(f => f.slotDefId === s.id)).length}/{sorted.length} linked
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.map(slot => {
          const fulfillment = fulfillments.find(f => f.slotDefId === slot.id)
          const isSaving = saving === slot.id
          const linked = fulfillment?.businessPartner ?? fulfillment?.fta
          const linkedName = fulfillment?.businessPartner?.name ?? (fulfillment?.fta ? (fulfillment.fta.name) : null)

          return (
            <div key={slot.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 5, background: linked ? 'rgba(74,222,128,0.05)' : 'rgba(155,109,255,0.04)', border: `1px solid ${linked ? 'rgba(74,222,128,0.18)' : 'rgba(155,109,255,0.15)'}` }}>
              {/* Status dot */}
              <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: linked ? '#4ade80' : 'rgba(155,109,255,0.4)', border: linked ? 'none' : '1px solid rgba(155,109,255,0.5)' }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 11, color: linked ? '#9BB0C4' : '#ffffff', fontWeight: 500 }}>{slot.label}</span>
                {linkedName && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#4ade80', fontWeight: 600 }}>{linkedName}</span>
                )}
                {!linked && (
                  <span style={{ marginLeft: 6, fontSize: 9, color: '#6B8299' }}>
                    · {slot.slotType === 'business_partner' ? 'Link a Business Partner' : 'Link a Field Appointment'}
                  </span>
                )}
              </div>

              {linked ? (
                <button
                  onClick={e => { e.stopPropagation(); unlinkRecord(slot) }}
                  disabled={isSaving}
                  style={{ background: 'none', border: 'none', color: '#6B8299', fontSize: 10, cursor: 'pointer', padding: '2px 6px', flexShrink: 0 }}
                >
                  {isSaving ? '…' : 'Unlink'}
                </button>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); openPicker(slot) }}
                  disabled={isSaving}
                  style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: 'rgba(155,109,255,0.12)', border: '1px solid rgba(155,109,255,0.3)', color: '#9B6DFF', cursor: 'pointer', flexShrink: 0 }}
                >
                  {isSaving ? '…' : '+ Link'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Picker dropdown */}
      {pickerSlotId && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ marginTop: 8, padding: '10px 12px', borderRadius: 6, background: '#0A1628', border: '1px solid rgba(155,109,255,0.25)', maxHeight: 220, overflowY: 'auto' }}
        >
          {pickerLoading ? (
            <div style={{ fontSize: 11, color: '#6B8299', padding: '8px 0' }}>Loading...</div>
          ) : pickerRecords.length === 0 ? (
            <div style={{ fontSize: 11, color: '#6B8299', padding: '8px 0' }}>
              No records found. Make sure you have {slots.find(s => s.id === pickerSlotId)?.slotType === 'business_partner' ? 'Business Partners' : 'completed Field Appointments'} in your tracker.
            </div>
          ) : (
            pickerRecords.map(rec => (
              <button
                key={rec.id}
                onClick={() => { const slot = slots.find(s => s.id === pickerSlotId); if (slot) linkRecord(slot, rec.id) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(155,109,255,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ fontSize: 12, color: '#ffffff', flex: 1 }}>{rec.name}</span>
                {rec.sub && <span style={{ fontSize: 10, color: '#6B8299' }}>{rec.sub}</span>}
              </button>
            ))
          )}
          <button
            onClick={e => { e.stopPropagation(); setPickerSlotId(null) }}
            style={{ marginTop: 6, fontSize: 10, color: '#6B8299', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// Pre-emptive heads-up shown next to every Connect Discord button.
// Discord rejects OAuth authorization (specifically the guilds.join
// scope we use) for accounts that don't have a verified email or
// phone number. Agents have hit this in the wild and we want them to
// hear about the fix BEFORE they smack into the error wall.
function DiscordVerifyHint() {
  return (
    <div style={{
      marginTop: 10, padding: '10px 12px',
      background: 'rgba(201,169,110,0.05)',
      border: '1px solid rgba(201,169,110,0.18)',
      borderRadius: 6, fontSize: 11, color: '#9BB0C4', lineHeight: 1.55,
      maxWidth: 480,
    }}>
      <div style={{ color: '#C9A96E', fontWeight: 700, marginBottom: 4, letterSpacing: '0.04em' }}>
        Heads up: Discord email verification
      </div>
      Your Discord account needs a verified email or phone number, otherwise Discord will block the connect. To check: open Discord &rarr; <strong style={{ color: '#fff' }}>User Settings &rarr; My Account</strong>, and click <strong style={{ color: '#fff' }}>Verify</strong> next to your email. Then come back here.
    </div>
  )
}

// Compute which System Progressions are achieved
function computeProgressions(data: AgentData): Record<string, boolean> {
  const has = (key: string, phase: number) =>
    data.phaseItems.some(i => i.itemKey === key && i.phase === phase && i.completed)
  // Only AWARDED milestones count toward the badge. PENDING_REVIEW and
  // REJECTED rows exist but don't unlock the progression.
  const hasMilestone = (m: string) =>
    data.milestones.some(mi => mi.milestone === m && mi.status === 'AWARDED')
  const hasAppointed = data.carrierAppointments.some(c => c.status === 'APPOINTED')

  return {
    code_number: true,
    client: has('client_1', 2),
    pass_license: has('pass_license_test', 1),
    business_partner_plan: has('business_marketing_plan', 1),
    licensed_appointed: has('first_1000', 2) && hasAppointed,
    '10_field_trainings': has('fta_10', 2),
    associate_promotion: has('associate_promotion', 2),
    net_license: has('first_1000', 2),
    cft_in_progress: has('cft_classes', 3),
    certified_field_trainer: has('cft_coordinator_signoff', 3),
    // Submission-typed milestones now require an AWARDED RecognitionMilestone
    // row. Backfill migration auto-awarded elite_trainer for everyone already
    // at phase >= 4 so existing badges don't disappear.
    elite_trainer: hasMilestone('elite_trainer'),
    marketing_director: has('45k_points', 4),
    '50k_watch': hasMilestone('50k_watch'),
    '100k_ring': hasMilestone('100k_ring'),
    emd: hasMilestone('emd'),
  }
}

const APPT_COLORS: Record<string, string> = {
  APPOINTED: '#4ade80', PENDING: '#f59e0b', JIT: '#9B6DFF', NOT_STARTED: '#4B5563',
}
const card = {
  background: '#132238',
  border: '1px solid rgba(201,169,110,0.1)',
  borderRadius: 6,
}
const sectionLabel = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
  textTransform: 'uppercase' as const, color: '#C9A96E', marginBottom: 14,
}
const inputStyle = {
  background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)',
  borderRadius: 4, color: '#9BB0C4', padding: '7px 10px',
  fontSize: 12, width: '100%', boxSizing: 'border-box' as const,
}
const fieldLabel = {
  fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.12em',
  textTransform: 'uppercase' as const, color: '#C9A96E',
  display: 'block', marginBottom: 4,
}

function AgentDashboardInner() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const searchParams = useSearchParams()
  const discordParam = searchParams.get('discord')
  const discordReason = searchParams.get('reason')
  const discordUsername = searchParams.get('username')
  const previewToken = searchParams.get('preview')
  // Notification deep-link plumbing: `?tab=new-business&submission=<id>`
  // lets a click on a "you were added as split agent" or "X commented
  // on your policy" notification open the right tab AND auto-open the
  // specific submission drawer instead of just dumping the agent on
  // the New Business list and making them hunt for it.
  const tabParam = searchParams.get('tab')
  const submissionParam = searchParams.get('submission')

  const [data, setData] = useState<AgentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'checklist' | 'licensing' | 'carriers' | 'partners' | 'fta' | 'new-business' | 'calls' | 'climb' | 'team' | 'profile'>(
    discordParam ? 'profile'
    : tabParam === 'new-business' ? 'new-business'
    : tabParam === 'partners' ? 'partners'
    : tabParam === 'fta' ? 'fta'
    : tabParam === 'calls' ? 'calls'
    : tabParam === 'climb' ? 'climb'
    // 'trainees' param redirects to 'team' since the trainees view
    // got merged into the team tab as an "Also training" section.
    : tabParam === 'team' || tabParam === 'trainees' ? 'team'
    : tabParam === 'profile' ? 'profile'
    : tabParam === 'licensing' ? 'licensing'
    : tabParam === 'carriers' ? 'carriers'
    : 'checklist'
  )
  // Use this for programmatic tab switches triggered from outside the tab
  // nav (e.g. "Complete your profile" link, checklist item actions). It
  // scrolls the tab strip into view so the agent actually sees the new
  // content instead of the page just silently re-rendering below the fold.
  const goToTab = useCallback((next: typeof activeTab) => {
    setActiveTab(next)
    requestAnimationFrame(() => {
      document.getElementById('agent-tab-nav')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  // Inline editor for the FTA appointment linked to a fta_N item.
  // Tracks the FTA id currently being edited + a working draft so the
  // agent can update notes / change status without leaving the
  // checklist. null = no editor open.
  const [ftaEditId, setFtaEditId] = useState<string | null>(null)
  const [ftaEditDraft, setFtaEditDraft] = useState<{ status: string; notes: string; businessPartnerId: string }>({ status: 'COMPLETED', notes: '', businessPartnerId: '' })
  const [ftaContacts, setFtaContacts] = useState<{ id: string; name: string }[]>([])
  const [ftaEditSaving, setFtaEditSaving] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [setupResources, setSetupResources] = useState<Record<string, string>>({})
  // LC booking link: admin-overridable via /vault/settings, falls back
  // to the LC_CALENDAR_URL constant until the fetch lands / if unset.
  const [lcCalendarSetting, setLcCalendarSetting] = useState('')
  const lcCalendarUrl = lcCalendarSetting || LC_CALENDAR_URL
  const [ftaModalKey, setFtaModalKey] = useState<string | null>(null)
  const [dbPhaseItems, setDbPhaseItems] = useState<Record<number, typeof PHASE_ITEMS[1]> | null>(null)
  // Database-backed group definitions, keyed by phase. When the
  // checklist editor has set up groups (and optionally banner videos),
  // these override the bundled PHASE_GROUPS constants. Each entry
  // mirrors the constant shape but with an extra `videos` array.
  type GroupVideo = { url: string; title: string | null; orientation: 'landscape' | 'portrait' }
  type GroupWithVideos = (typeof PHASE_GROUPS[1][number]) & {
    videos: GroupVideo[]
  }
  const [dbPhaseGroups, setDbPhaseGroups] = useState<Record<number, GroupWithVideos[]> | null>(null)
  const [showPromotion, setShowPromotion] = useState<number | null>(null)
  const [highlightKey, setHighlightKey] = useState<string | null>(null)
  const [promotionRequestKey, setPromotionRequestKey] = useState<string | null>(null)
  const [promotionRequesting, setPromotionRequesting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const toggleExpanded = (key: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const expandAll = (phase: number) => {
    const keys = (PHASE_ITEMS[phase] ?? []).map(i => i.key)
    setExpandedItems(new Set(keys))
    setCollapsedGroups(new Set())
  }
  const collapseAll = () => {
    setExpandedItems(new Set())
    const groups = PHASE_GROUPS[activeChecklistPhase] ?? []
    setCollapsedGroups(new Set(groups.map(g => g.key)))
  }
  const [selectedProgression, setSelectedProgression] = useState<string | null>(null)
  const [checklistPhase, setChecklistPhase] = useState<number | null>(null)

  // Coordinator requests — keyed by phaseItemKey
  interface CoordinatorRequest {
    id: string
    phaseItemKey: string | null
    topic: string
    message: string
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
    resolutionNote: string | null
    createdAt: string
    resolvedAt: string | null
  }
  const [coordinatorRequests, setCoordinatorRequests] = useState<CoordinatorRequest[]>([])
  const [requestModalItemKey, setRequestModalItemKey] = useState<string | null>(null)
  // Tracks which direct_N item is currently using the "Pick recruit"
  // modal. Null = closed.
  const [recruitClaimItemKey, setRecruitClaimItemKey] = useState<string | null>(null)

  const fetchCoordinatorRequests = useCallback(async () => {
    const url = previewToken ? `/api/agents/coordinator-requests?preview=${previewToken}` : '/api/agents/coordinator-requests'
    const res = await fetch(url)
    if (res.ok) {
      const d = await res.json() as { requests: CoordinatorRequest[] }
      setCoordinatorRequests(d.requests ?? [])
    }
  }, [previewToken])

  useEffect(() => { fetchCoordinatorRequests() }, [fetchCoordinatorRequests])

  const fetchData = useCallback(async () => {
    const url = previewToken ? `/api/agents/me?preview=${previewToken}` : '/api/agents/me'
    const res = await fetch(url)
    if (res.status === 401 && !previewToken) { router.push('/agents/login'); return }
    if (res.status === 403) {
      const body = await res.json() as { error?: string }
      if (body.error === 'AccountInactive') {
        router.push('/agents/login?reason=inactive')
        return
      }
    }
    if (!res.ok) { setLoading(false); return }
    setData(await res.json() as AgentData)
    setLoading(false)
  }, [router])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!data || !(data as AgentData & { justPromoted?: boolean }).justPromoted) return
    setShowPromotion(data.phase)
    import('canvas-confetti').then(({ default: confetti }) => {
      const end = Date.now() + 3000
      const frame = () => {
        confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors: ['#C9A96E', '#4ade80', '#60a5fa', '#ffffff'] })
        confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors: ['#C9A96E', '#4ade80', '#60a5fa', '#ffffff'] })
        if (Date.now() < end) requestAnimationFrame(frame)
      }
      frame()
    })
  // Only run on initial load, not on refetches
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  useEffect(() => {
    fetch('/api/agents/setup-resources')
      .then(r => r.ok ? r.json() : { resources: {} })
      .then((d: { resources: Record<string, string> }) => setSetupResources(d.resources ?? {}))
      .catch(() => {})
    fetch('/api/agents/settings')
      .then(r => r.ok ? r.json() : { settings: {} })
      .then((d: { settings?: { LC_CALENDAR_URL?: string } }) => setLcCalendarSetting(d.settings?.LC_CALENDAR_URL ?? ''))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/agents/phase-items')
      .then(r => r.ok ? r.json() : null)
      .then((d: {
        items: Record<string, { itemKey: string; label: string; description: string; duration?: string; groupKey?: string; adminOnly?: boolean; coordinatorTopic?: string; actionJson?: string; videoUrl?: string | null; videoTitle?: string | null; videos?: Array<{ url: string; title?: string | null }> | null; slots?: SlotDef[] }[]>
        groups?: Record<string, Array<{ key: string; label: string; icon?: string | null; description?: string | null; showTrainer?: boolean; videos?: Array<{ url: string; title: string | null; orientation?: 'landscape' | 'portrait' }> }>>
        source: string
      } | null) => {
        if (d?.source === 'database' && d.items) {
          const mapped: Record<number, typeof PHASE_ITEMS[1]> = {}
          for (const [phase, phaseItems] of Object.entries(d.items)) {
            mapped[parseInt(phase)] = (phaseItems as typeof d.items[string]).map(i => {
              // Prefer the new multi-video array; fall back to the legacy
              // single-video columns so items that haven't been re-saved
              // since the migration still render their video.
              const videos = Array.isArray(i.videos) && i.videos.length
                ? i.videos.filter(v => v && typeof v.url === 'string' && v.url)
                : (i.videoUrl ? [{ url: i.videoUrl, title: i.videoTitle ?? null }] : [])
              return {
                key: i.itemKey, label: i.label, description: i.description,
                duration: i.duration, group: i.groupKey ?? undefined,
                adminOnly: i.adminOnly,
                coordinatorTopic: i.coordinatorTopic as typeof PHASE_ITEMS[1][0]['coordinatorTopic'],
                action: i.actionJson ? JSON.parse(i.actionJson) : undefined,
                videoUrl: videos[0]?.url,
                videoTitle: videos[0]?.title ?? undefined,
                videos,
                slots: (i.slots ?? []) as SlotDef[],
              }
            })
          }
          setDbPhaseItems(mapped)
        }
        // Group definitions come back when the checklist editor has
        // populated them. Each carries an optional banner-video array
        // shown at the top of the step on this page.
        if (d?.groups && !Array.isArray(d.groups)) {
          const mappedGroups: Record<number, GroupWithVideos[]> = {}
          for (const [phase, phaseGroups] of Object.entries(d.groups)) {
            if (!Array.isArray(phaseGroups)) continue
            mappedGroups[parseInt(phase)] = phaseGroups.map(g => ({
              key: g.key,
              label: g.label,
              icon: g.icon ?? undefined,
              description: g.description ?? undefined,
              showTrainer: g.showTrainer ?? false,
              videos: Array.isArray(g.videos)
                ? g.videos.filter(v => v && typeof v.url === 'string' && v.url.length > 0)
                  .map(v => ({
                    url: v.url,
                    title: v.title ?? null,
                    orientation: v.orientation === 'portrait' ? 'portrait' as const : 'landscape' as const,
                  }))
                : [],
            }) as GroupWithVideos)
          }
          if (Object.keys(mappedGroups).length > 0) setDbPhaseGroups(mappedGroups)
        }
      })
      .catch(() => {})
  }, [])

  const effectivePhaseGroups: Record<number, GroupWithVideos[] | typeof PHASE_GROUPS[1]> = dbPhaseGroups ?? PHASE_GROUPS

  const effectivePhaseItems = dbPhaseItems ?? PHASE_ITEMS

  // Milestone-item keys that trigger a confetti burst on completion.
  // Two trigger paths:
  //   1. Self-tick on the checklist → fires from the toggleItem
  //      handler below (instant).
  //   2. Admin-approved (SA Promotion, CFT sign-offs) → the agent
  //      doesn't click. The useEffect right after detects 'recently
  //      completed items I haven't celebrated on this device yet'
  //      and fires confetti when the dashboard next loads.
  const CONFETTI_MILESTONES = new Set([
    'fta_10', 'first_1000', 'cft_coordinator_signoff',
    '45k_points', '150k_net_6mo', '100k_income',
    'associate_promotion',
  ])

  // Catch-up confetti for admin-approved milestone completions
  // (SA Promotion, CFT sign-offs) that happened while the agent was
  // away. Looks for any CONFETTI_MILESTONES item completed in the
  // last 30 minutes and not previously celebrated on this device.
  // localStorage keyed cursor is per-device but that's fine — agents
  // who switch phones occasionally see the confetti twice, which
  // is the right side of wrong.
  useEffect(() => {
    if (!data) return
    const RECENT_MS = 30 * 60 * 1000
    let seen: string[] = []
    try {
      seen = JSON.parse(window.localStorage.getItem('aff.celebrated.items') || '[]') as string[]
    } catch { /* corrupted, treat as empty */ }
    const now = Date.now()
    const fresh = data.phaseItems.filter(i =>
      i.completed && CONFETTI_MILESTONES.has(i.itemKey) &&
      i.completedAt &&
      (now - new Date(i.completedAt).getTime()) < RECENT_MS &&
      !seen.includes(i.itemKey)
    )
    if (fresh.length === 0) return
    import('canvas-confetti').then(({ default: confetti }) => {
      confetti({
        particleCount: 100, spread: 70, origin: { y: 0.6 },
        colors: ['#C9A96E', '#4ade80', '#60a5fa', '#ffffff'],
      })
    }).catch(() => { /* lib missing — confetti is nice-to-have */ })
    try {
      window.localStorage.setItem(
        'aff.celebrated.items',
        JSON.stringify([...seen, ...fresh.map(f => f.itemKey)]),
      )
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id])

  const toggleItem = async (itemKey: string, phase: number, current: boolean) => {
    if (!data) return
    setTogglingKey(itemKey)
    await fetch('/api/agents/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemKey, phase, completed: !current }),
    })
    await fetchData()
    setTogglingKey(null)
    if (!current && CONFETTI_MILESTONES.has(itemKey)) {
      import('canvas-confetti').then(({ default: confetti }) => {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#C9A96E', '#4ade80', '#60a5fa', '#ffffff'] })
      })
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0A1628',
      }}>
        <div style={{ position: 'relative', width: 80, height: 80, marginBottom: 24 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '2px solid rgba(201,169,110,0.1)',
          }} />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: '#C9A96E',
            animation: 'aff-spin 1s linear infinite',
          }} />
          <div style={{
            position: 'absolute', inset: 8, borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: 'rgba(201,169,110,0.4)',
            animation: 'aff-spin 1.5s linear infinite reverse',
          }} />
          <div style={{
            position: 'absolute', inset: 20, borderRadius: '50%',
            border: '1px solid transparent',
            borderTopColor: 'rgba(201,169,110,0.2)',
            animation: 'aff-spin 2s linear infinite',
          }} />
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 8, height: 8, borderRadius: '50%',
            background: '#C9A96E',
            boxShadow: '0 0 12px rgba(201,169,110,0.5)',
            animation: 'aff-pulse 1.5s ease-in-out infinite',
          }} />
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.25em',
          textTransform: 'uppercase', color: '#C9A96E',
          animation: 'aff-fade 1.5s ease-in-out infinite',
        }}>
          All Financial Freedom
        </div>
        <div style={{
          fontSize: 11, color: '#6B8299', marginTop: 6,
          animation: 'aff-fade 1.5s ease-in-out infinite 0.3s',
        }}>
          Loading your portal...
        </div>
        <style>{`
          @keyframes aff-spin { to { transform: rotate(360deg); } }
          @keyframes aff-pulse { 0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); } 50% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); } }
          @keyframes aff-fade { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
          @keyframes aff-highlight-pulse { 0%, 100% { box-shadow: 0 0 0 2px #C9A96E, 0 0 20px rgba(201,169,110,0.3); } 50% { box-shadow: 0 0 0 3px #C9A96E, 0 0 30px rgba(201,169,110,0.5); } }
        `}</style>
      </div>
    )
  }
  if (!data) {
    // Most common cause is a stale session after an email change: the
    // user's session JWT still references their previous email, but
    // /api/agents/me looks up by that email and the DB row has moved
    // on. Force-signing out and back in with the new address recovers
    // them. Trainer fallback stays for actual missing-profile cases.
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        <div style={{ color: '#f87171', fontSize: 13, textAlign: 'center' }}>
          We couldn&apos;t load your profile.
        </div>
        <div style={{ color: '#9BB0C4', fontSize: 12, textAlign: 'center', maxWidth: 380, lineHeight: 1.6 }}>
          If you recently changed your email, your old login session needs to be refreshed. Sign out and sign back in with your new email. Otherwise, contact your trainer.
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/agents/login' })}
          style={{
            background: '#C9A96E', color: '#142D48', border: 'none',
            borderRadius: 4, padding: '10px 20px', fontSize: 12,
            fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Sign out &amp; sign back in
        </button>
      </div>
    )
  }

  const activeChecklistPhase = checklistPhase ?? data.phase
  const currentPhaseItems = data.phaseItems.filter(i => i.phase === activeChecklistPhase)
  const currentPhaseProgress = data.allPhaseProgress.find(p => p.phase === activeChecklistPhase)
  const daysInPhase = data.phaseStartedAt
    ? Math.floor((Date.now() - new Date(data.phaseStartedAt).getTime()) / 86400000)
    : null
  const appointedCount = data.carrierAppointments.filter(c => c.status === 'APPOINTED').length
  const progressions = computeProgressions(data)
  const achievedCount = Object.values(progressions).filter(Boolean).length

  // Licensing progress. The 'carriers' derived item auto-checks once the
  // agent has at least one APPOINTED carrier, but it's also manually
  // toggleable (phaseItemKey backs it) for the case where the appointment
  // letter beats the LC updating their tracker.
  const someAppointed = data.carrierAppointments.some(c => c.status === 'APPOINTED')
  const licensingCompleted = LICENSING_CHECKLIST.filter(item => {
    const phaseItem = data.phaseItems.find(pi => pi.phase === 1 && pi.itemKey === item.phaseItemKey)
    const manuallyDone = phaseItem?.completed ?? false
    if (item.derived === 'carriers') return manuallyDone || someAppointed
    return manuallyDone
  }).length

  // My Team tab now also surfaces agents whose `cft` field matches
  // me (the trainer-only case). Used to be a separate "My Trainees"
  // tab but the CEO consolidated them — see /api/agents/team's
  // cftOnlyMembers in the response.
  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: 'checklist', label: 'Checklist' },
    { key: 'licensing', label: 'Licensing' },
    { key: 'carriers', label: 'Carriers' },
    { key: 'partners', label: 'Partners / FTA' },
    { key: 'fta', label: 'FTA Tracker' },
    { key: 'new-business', label: 'New Business' },
    { key: 'calls', label: 'Calls' },
    { key: 'climb', label: 'Climb' },
    { key: 'team', label: 'My Team' },
    { key: 'profile', label: 'Profile' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628' }}>
      {/* Preview mode banner */}
      {previewToken && data && (
        <div style={{
          background: 'rgba(155,109,255,0.12)', borderBottom: '1px solid rgba(155,109,255,0.3)',
          padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontSize: 12, color: '#9B6DFF', fontWeight: 600,
        }}>
          Viewing as {data.firstName} {data.lastName} ({data.agentCode}) &middot; read-only preview
          <button onClick={() => window.close()} style={{ background: 'rgba(155,109,255,0.15)', border: '1px solid rgba(155,109,255,0.3)', color: '#9B6DFF', borderRadius: 4, padding: '4px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Close</button>
        </div>
      )}
      {/* Contest banner: stacks above the tabs when there are active
          bonuses for this agent. Self-fetches /api/agents/contests so
          the agent dashboard payload doesn't grow. Hides itself when
          there are no in-window contests. */}
      {data && <ContestBanner previewToken={previewToken} />}
      {/* One-time red-carpet greeting for a configured distinguished
          guest. Renders null for everyone else. */}
      {data && <VipPortalWelcome previewToken={previewToken} />}
      {/* Top nav. Mobile gets a deliberately tighter treatment: the
          "Agent Portal" subtitle disappears, the avatar drops the name
          chip, the four quick-link pills become icon-only squares, and
          'Sign out' becomes a single arrow glyph. Desktop keeps full
          labels because there's room for them. */}
      <div style={{
        borderBottom: '1px solid rgba(201,169,110,0.1)',
        padding: isMobile ? '10px 14px' : '14px clamp(16px, 4vw, 32px)',
        paddingTop: `calc(${isMobile ? 10 : 14}px + env(safe-area-inset-top))`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: isMobile ? 8 : 12, flexWrap: 'nowrap',
        background: '#0A1628', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, minWidth: 0, flexShrink: 1 }}>
          <span style={{
            fontSize: isMobile ? 9 : 10, fontWeight: 700,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E',
            whiteSpace: 'nowrap',
          }}>
            {isMobile ? 'AFF' : 'All Financial Freedom'}
          </span>
          {!isMobile && (
            <span style={{ fontSize: 11, color: '#4B5563' }}>Agent Portal</span>
          )}
          <div style={{
            width: isMobile ? 26 : 30, height: isMobile ? 26 : 30, borderRadius: '50%',
            background: data.avatarUrl ? 'transparent' : 'rgba(201,169,110,0.15)',
            border: '1px solid rgba(201,169,110,0.3)',
            overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginLeft: isMobile ? 4 : 6,
          }}>
            {data.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 10, color: '#C9A96E', fontWeight: 700 }}>
                {data.firstName.charAt(0)}{data.lastName.charAt(0)}
              </span>
            )}
          </div>
          {!isMobile && (
            <span style={{ fontSize: 12, color: '#6B8299', whiteSpace: 'nowrap' }}>
              {data.firstName} {data.lastName} &middot; {data.agentCode}
            </span>
          )}
        </div>
        <nav
          aria-label="Quick links"
          style={{
            display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 6,
            flexShrink: 0,
          }}
        >
          {isMobile ? (
            <>
              <NotificationCenter />
              <button
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
                style={{
                  background: 'rgba(201,169,110,0.06)', border: '1px solid rgba(201,169,110,0.18)',
                  color: '#C9A96E', cursor: 'pointer', borderRadius: 6,
                  padding: '7px 9px', display: 'flex', alignItems: 'center', lineHeight: 1,
                }}
              >
                <Menu size={18} />
              </button>
            </>
          ) : (
            <>
              <NavbarLink href="/agents/leaderboard" Icon={Trophy} label="Leaderboard" />
              <NavbarLink href="/agents/team" Icon={Users} label="Directory" />
              <NavbarLink href="/agents/trainings" Icon={CalendarDays} label="Trainings" />
              <NavbarLink href="/agents/guide" Icon={BookOpen} label="Guide" />
              <NavbarLink href="/agents/resources" Icon={Folder} label="Resources" />
              <NavbarLink href="/agents/book" Icon={CalendarDays} label="Book" />
              <NotificationCenter />
              <button
                onClick={() => signOut({ callbackUrl: '/agents/login' })}
                title="Sign out"
                aria-label="Sign out"
                style={{
                  background: 'none', border: 'none',
                  color: '#6B8299', cursor: 'pointer',
                  padding: '6px 8px', fontSize: 12,
                  marginLeft: 4, lineHeight: 1,
                }}
              >
                Sign out
              </button>
            </>
          )}
        </nav>

        {/* Mobile full-screen nav menu */}
        {isMobile && menuOpen && (
          <div
            onClick={() => setMenuOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'rgba(10,22,40,0.92)', backdropFilter: 'blur(8px)',
              display: 'flex', flexDirection: 'column',
              paddingTop: 'calc(24px + env(safe-area-inset-top))',
              paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
            }}
          >
            {/* Close button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 20px 20px' }}>
              <button
                onClick={() => setMenuOpen(false)}
                style={{ background: 'none', border: 'none', color: '#C9A96E', cursor: 'pointer', padding: 4 }}
                aria-label="Close menu"
              >
                <X size={22} />
              </button>
            </div>

            {/* Nav items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 16px' }}
              onClick={e => e.stopPropagation()}
            >
              {[
                { href: '/agents/leaderboard', Icon: Trophy, label: 'Leaderboard', desc: 'See top performers' },
                { href: '/agents/team', Icon: Users, label: 'Team Directory', desc: 'Browse and save headshots' },
                { href: '/agents/trainings', Icon: CalendarDays, label: 'Trainings', desc: 'Upcoming sessions + downloadable flyers' },
                { href: '/agents/guide', Icon: BookOpen, label: 'Agent Guide', desc: 'Your step-by-step playbook' },
                { href: '/agents/resources', Icon: Folder, label: 'Resources', desc: 'Tools and materials' },
                { href: '/agents/book', Icon: CalendarDays, label: 'Book a Call', desc: 'Schedule time with leadership' },
              ].map(({ href, Icon, label, desc }) => (
                <a
                  key={href}
                  href={previewToken ? `${href}?preview=${encodeURIComponent(previewToken)}` : href}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 16px', borderRadius: 10,
                    background: 'rgba(201,169,110,0.04)',
                    border: '1px solid rgba(201,169,110,0.1)',
                    textDecoration: 'none',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 8,
                    background: 'rgba(201,169,110,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon size={20} color="#C9A96E" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{label}</div>
                    <div style={{ fontSize: 11, color: '#6B8299', marginTop: 1 }}>{desc}</div>
                  </div>
                </a>
              ))}

              {/* Sign out */}
              <button
                onClick={() => signOut({ callbackUrl: '/agents/login' })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', borderRadius: 10, marginTop: 8,
                  background: 'rgba(248,113,113,0.04)',
                  border: '1px solid rgba(248,113,113,0.1)',
                  cursor: 'pointer', width: '100%', textAlign: 'left',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 8,
                  background: 'rgba(248,113,113,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <LogOut size={20} color="#f87171" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#f87171' }}>Sign Out</div>
                  <div style={{ fontSize: 11, color: '#6B8299', marginTop: 1 }}>Return to login</div>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Branded masthead strip */}
      <div style={{
        height: 'clamp(120px, 18vw, 180px)',
        backgroundImage: "linear-gradient(180deg, rgba(10,22,40,0.35) 0%, rgba(10,22,40,0.7) 60%, #0A1628 100%), url('/brand/banner-lines.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        marginTop: -1,
      }} />

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 clamp(16px, 4vw, 24px) clamp(20px, 5vw, 36px)', marginTop: 'clamp(-60px, -8vw, -40px)', position: 'relative' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 300, color: '#ffffff', textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>My Progression</div>
          <div style={{ fontSize: 12, color: '#6B8299', marginTop: 4 }}>
            {data.state && `${data.state} · `}
            {data.cft && `Trainer: ${data.cft} · `}
            {data.icaDate && `Started: ${new Date(data.icaDate).toLocaleDateString()}`}
            {!data.phone && (
              <button
                onClick={() => goToTab('profile')}
                style={{ marginLeft: 12, background: 'none', border: 'none', color: '#f59e0b', fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Complete your profile →
              </button>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Discord Role', value: data.discordRoleName ?? `Phase ${data.phase}`, color: PHASE_COLORS[data.phase] },
            { label: 'Days in Phase', value: daysInPhase != null ? `${daysInPhase}d` : '—', color: '#9BB0C4' },
            { label: 'Phase Complete', value: `${currentPhaseProgress?.pct ?? 0}%`, color: '#C9A96E' },
            { label: 'Carriers Appointed', value: `${appointedCount}/${CARRIERS.length}`, color: '#4ade80' },
          ].map(stat => (
            <div key={stat.label} style={{ ...card, padding: '16px 20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 6 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        <AnnouncementBanner />

        {/* ── NEXT STEP CARD — finds first incomplete item across ALL phases ── */}
        {(() => {
          let nextItem: typeof PHASE_ITEMS[1][0] | null = null
          let nextPhase = 0
          for (let ph = 1; ph <= 5; ph++) {
            const items = effectivePhaseItems[ph] ?? []
            const phItems = data.phaseItems
            const found = items.find(item => {
              if (item.key === 'connect_discord') return !data.discordUserId
              if (item.adminOnly) {
                const hasPendingReq = coordinatorRequests.some(r => r.phaseItemKey === item.key && (r.status === 'OPEN' || r.status === 'IN_PROGRESS'))
                const isDone = phItems.some(pi => pi.phase === ph && pi.itemKey === item.key && pi.completed)
                return !isDone && !hasPendingReq
              }
              return !phItems.some(pi => pi.phase === ph && pi.itemKey === item.key && pi.completed)
            })
            if (found) { nextItem = found; nextPhase = ph; break }
          }

          const totalAll = data.allPhaseProgress.reduce((s, p) => s + p.total, 0)
          const doneAll = data.allPhaseProgress.reduce((s, p) => s + p.completed, 0)
          const allDone = totalAll > 0 && doneAll >= totalAll

          if (allDone) {
            return (
              <div style={{
                marginBottom: 16, padding: isMobile ? '20px 16px' : '22px 28px', borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(74,222,128,0.1) 0%, rgba(201,169,110,0.06) 100%)',
                border: '1px solid rgba(74,222,128,0.25)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(74,222,128,0.15)', border: '1.5px solid rgba(74,222,128,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#4ade80', flexShrink: 0 }}>&#10003;</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#4ade80' }}>All Phases Complete</div>
                    <div style={{ fontSize: 12, color: '#9BB0C4', marginTop: 2 }}>You&apos;ve reached the top. Keep building your legacy.</div>
                  </div>
                </div>
              </div>
            )
          }

          if (!nextItem) return null

          const group = (PHASE_GROUPS[nextPhase] ?? []).find(g => g.key === nextItem!.group)
          const phaseProgress = data.allPhaseProgress.find(p => p.phase === nextPhase)
          const isOtherPhase = nextPhase !== data.phase

          return (
            <div style={{
              marginBottom: 16, borderRadius: 10, overflow: 'hidden',
              border: '1.5px solid rgba(96,165,250,0.3)',
              boxShadow: '0 4px 32px rgba(96,165,250,0.1), 0 1px 0 rgba(96,165,250,0.15) inset',
            }}>
              {/* Header bar */}
              <div style={{
                padding: isMobile ? '12px 16px' : '12px 28px',
                background: 'linear-gradient(135deg, rgba(96,165,250,0.12) 0%, rgba(96,165,250,0.06) 100%)',
                borderBottom: '1px solid rgba(96,165,250,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: '#ffffff',
                    boxShadow: '0 2px 8px rgba(96,165,250,0.4)',
                  }}>&#10140;</div>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Your Next Step
                    </span>
                    {isOtherPhase && (
                      <span style={{ fontSize: 9, color: '#f59e0b', marginLeft: 8, padding: '1px 6px', background: 'rgba(245,158,11,0.1)', borderRadius: 3, fontWeight: 600 }}>
                        Phase {nextPhase}
                      </span>
                    )}
                  </div>
                </div>
                {phaseProgress && (
                  <span style={{ fontSize: 10, color: '#6B8299' }}>
                    {phaseProgress.completed}/{phaseProgress.total} in Phase {nextPhase}
                  </span>
                )}
              </div>

              {/* Content */}
              <div style={{
                padding: isMobile ? '16px 16px 18px' : '18px 28px 20px',
                background: 'rgba(96,165,250,0.03)',
              }}>
                <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: 16, flexDirection: isMobile ? 'column' : 'row' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#ffffff' }}>{nextItem.label}</span>
                      {nextItem.duration && (
                        <span style={{ fontSize: 9, color: '#60a5fa', padding: '2px 8px', background: 'rgba(96,165,250,0.1)', borderRadius: 10, fontWeight: 600 }}>{nextItem.duration}</span>
                      )}
                    </div>
                    {group && (
                      <div style={{ fontSize: 10, color: '#6B8299', marginBottom: 6 }}>{group.label}</div>
                    )}
                    <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.6 }}>
                      <MarkdownDescription text={nextItem.description.length > 180 ? nextItem.description.slice(0, 180) + '...' : nextItem.description} />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (nextPhase !== activeChecklistPhase) setChecklistPhase(nextPhase)
                      goToTab('checklist')
                      const groupKey = nextItem!.group
                      if (groupKey) {
                        setCollapsedGroups(prev => { const n = new Set(prev); n.delete(groupKey); return n })
                      }
                      setTimeout(() => {
                        setExpandedItems(prev => new Set(prev).add(nextItem!.key))
                        setHighlightKey(nextItem!.key)
                        const el = document.querySelector(`[data-item-key="${nextItem!.key}"]`)
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        setTimeout(() => setHighlightKey(null), 2500)
                      }, 300)
                    }}
                    style={{
                      padding: '14px 28px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                      background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                      border: 'none', color: '#ffffff',
                      cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                      boxShadow: '0 4px 20px rgba(96,165,250,0.35)',
                      letterSpacing: '0.04em',
                      minWidth: isMobile ? '100%' : undefined,
                      textAlign: 'center',
                    }}
                  >
                    Start This Step &#8594;
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── SYSTEM PROGRESSIONS — always visible achievement strip ── */}
        <div style={{ ...card, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={sectionLabel}>System Progressions</div>
              <div style={{ fontSize: 10, color: '#4B5563', marginTop: -10, marginBottom: 4 }}>These unlock automatically as you complete milestones. Tap any badge to see how.</div>
            </div>
            <span style={{ fontSize: 11, color: '#6B8299' }}>{achievedCount} of {SYSTEM_PROGRESSIONS.length} achieved</span>
          </div>
          <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <div style={{ display: 'flex', gap: 8, minWidth: 'max-content' }}>
              {SYSTEM_PROGRESSIONS.map(prog => {
                const achieved = progressions[prog.key] ?? false
                const isSelected = selectedProgression === prog.key
                const BadgeIcon = PROGRESSION_ICONS[prog.key]
                return (
                  <button
                    key={prog.key}
                    onClick={() => setSelectedProgression(isSelected ? null : prog.key)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      padding: '10px 10px 8px', borderRadius: 8, cursor: 'pointer',
                      minWidth: 72, maxWidth: 80, textAlign: 'center',
                      background: isSelected
                        ? (achieved ? 'rgba(201,169,110,0.2)' : 'rgba(255,255,255,0.06)')
                        : achieved ? 'rgba(201,169,110,0.08)' : 'rgba(255,255,255,0.02)',
                      border: `1.5px solid ${isSelected ? (achieved ? '#C9A96E' : 'rgba(255,255,255,0.2)') : achieved ? 'rgba(201,169,110,0.3)' : 'rgba(255,255,255,0.05)'}`,
                      boxShadow: achieved ? '0 0 16px rgba(201,169,110,0.2), inset 0 1px 0 rgba(201,169,110,0.1)' : 'none',
                      transition: 'all 0.2s',
                      position: 'relative',
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 8, marginBottom: 6,
                      background: achieved
                        ? 'linear-gradient(135deg, #C9A96E 0%, #a8854a 100%)'
                        : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${achieved ? 'rgba(201,169,110,0.5)' : 'rgba(255,255,255,0.06)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: achieved ? '0 2px 8px rgba(201,169,110,0.3)' : 'none',
                    }}>
                      {BadgeIcon
                        ? <BadgeIcon size={16} color={achieved ? '#142D48' : '#4B5563'} strokeWidth={2.2} />
                        : <span style={{ fontSize: 12, color: achieved ? '#142D48' : '#4B5563' }}>{achieved ? '\u2713' : '\u00b7'}</span>
                      }
                    </div>
                    <div style={{
                      fontSize: 8, fontWeight: 700, lineHeight: 1.25,
                      color: achieved ? '#C9A96E' : '#4B5563',
                      letterSpacing: '0.02em',
                    }}>
                      {prog.label}
                    </div>
                    {achieved && (
                      <div style={{
                        position: 'absolute', top: -3, right: -3,
                        width: 12, height: 12, borderRadius: '50%',
                        background: '#4ade80', border: '2px solid #132238',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 7, color: '#0A1628', fontWeight: 700,
                      }}>{'\u2713'}</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selected progression detail */}
          {selectedProgression && (() => {
            const prog = SYSTEM_PROGRESSIONS.find(p => p.key === selectedProgression)!
            const achieved = progressions[selectedProgression] ?? false
            const DetailIcon = PROGRESSION_ICONS[prog.key]
            return (
              <div style={{
                marginTop: 12, padding: '16px 18px', borderRadius: 8,
                background: achieved ? 'rgba(201,169,110,0.07)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${achieved ? 'rgba(201,169,110,0.2)' : 'rgba(255,255,255,0.07)'}`,
                display: 'flex', gap: 14, alignItems: 'flex-start',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: achieved
                    ? 'linear-gradient(135deg, #C9A96E 0%, #a8854a 100%)'
                    : 'rgba(255,255,255,0.05)',
                  border: `1.5px solid ${achieved ? 'rgba(201,169,110,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: achieved ? '0 2px 10px rgba(201,169,110,0.3)' : 'none',
                }}>
                  {DetailIcon
                    ? <DetailIcon size={20} color={achieved ? '#142D48' : '#4B5563'} strokeWidth={2} />
                    : <span style={{ fontSize: 14, color: achieved ? '#142D48' : '#4B5563' }}>{achieved ? '\u2713' : '\u00b7'}</span>
                  }
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: achieved ? '#C9A96E' : '#9BB0C4', marginBottom: 4 }}>
                    {prog.label}
                  </div>
                  <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.6 }}>
                    {prog.description}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 10, color: achieved ? '#4ade80' : '#4B5563', fontStyle: 'italic' }}>
                    {achieved ? 'Achieved' : (MILESTONE_BY_KEY[prog.key]?.criteria ?? 'Complete the required milestones to unlock.')}
                  </div>
                  <MilestoneSubmitControl
                    milestoneKey={prog.key}
                    milestones={data.milestones}
                    onSubmitted={fetchData}
                  />
                </div>
                <button
                  onClick={() => setSelectedProgression(null)}
                  style={{ background: 'none', border: 'none', color: '#4B5563', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>
            )
          })()}
        </div>

        {/* ── Phase roadmap ── */}
        <div style={{ ...card, padding: '20px 24px', marginBottom: 24 }}>
          <div style={sectionLabel}>Your Journey</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 8 }}>
            {[1, 2, 3, 4, 5, 6].map((phase, idx) => {
              const prog = data.allPhaseProgress.find(p => p.phase === phase)
              const isCurrent = phase === data.phase
              const isDone = phase < data.phase
              const isFuture = phase > data.phase
              const pct = prog?.pct ?? 0
              return (
                <div key={phase} style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 140 }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: isDone ? '#4ade80' : isCurrent ? PHASE_COLORS[phase] : 'transparent',
                        border: `2px solid ${isDone ? '#4ade80' : isCurrent ? PHASE_COLORS[phase] : 'rgba(255,255,255,0.1)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: isDone ? 14 : 12, fontWeight: 700,
                        color: isDone ? '#0A1628' : isCurrent ? '#0A1628' : '#4B5563',
                      }}>
                        {isDone ? '✓' : phase}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: isCurrent ? 700 : 400, color: isFuture ? '#4B5563' : '#9BB0C4', marginBottom: 3 }}>
                      {PHASE_LABELS[phase].title}
                    </div>
                    <div style={{ fontSize: 9, color: '#4B5563', marginBottom: 5 }}>{PHASE_LABELS[phase].standard}</div>
                    {isCurrent && (
                      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, margin: '0 8px' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: PHASE_COLORS[phase], borderRadius: 2, transition: 'width 0.5s' }} />
                      </div>
                    )}
                    {isDone && <div style={{ fontSize: 9, color: '#4ade80' }}>Complete</div>}
                  </div>
                  {idx < 4 && (
                    <div style={{ height: 2, width: 24, marginTop: 16, flexShrink: 0, background: isDone ? '#4ade80' : 'rgba(255,255,255,0.06)' }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Tab navigation ── */}
        {/* Wrapped to layer scroll affordances (left/right gradient
            fades + chevron buttons) over the actual horizontal scroll
            container. The strip has up to 11 tabs and overflows on
            most screen sizes; without affordance the CEO + Mercedes
            had no idea anything was to the right of "My Team".
            Active-tab auto-scroll-into-view (smooth, centered) also
            handles the case where the agent clicks a hamburger-menu
            link that jumps to a tab off the current scroll viewport. */}
        <TabStrip
          tabs={TABS}
          activeTab={activeTab}
          onSelect={key => setActiveTab(key as typeof activeTab)}
          licensingBadge={licensingCompleted < LICENSING_CHECKLIST.length ? LICENSING_CHECKLIST.length - licensingCompleted : 0}
        />

        {/* ── PHASE CHECKLIST TAB ── */}
        {activeTab === 'checklist' && (
          <div style={{ ...card, padding: '24px 28px' }}>

            {/* Phase sub-tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6].map(ph => {
                const prog = data.allPhaseProgress.find(p => p.phase === ph)
                const isActive = activeChecklistPhase === ph
                const isCurrent = ph === data.phase
                const isDone = ph < data.phase
                return (
                  <button
                    key={ph}
                    onClick={() => setChecklistPhase(ph)}
                    style={{
                      padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                      fontWeight: isActive ? 700 : 400, letterSpacing: '0.08em',
                      border: `1px solid ${isActive ? PHASE_COLORS[ph] : 'rgba(255,255,255,0.08)'}`,
                      background: isActive ? `${PHASE_COLORS[ph]}18` : 'transparent',
                      color: isActive ? PHASE_COLORS[ph] : isDone ? '#4ade80' : isCurrent ? '#9BB0C4' : '#4B5563',
                      transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {isDone && <span style={{ fontSize: 9 }}>✓</span>}
                    Phase {ph}
                    {isCurrent && !isActive && <span style={{ fontSize: 8, color: '#C9A96E', fontWeight: 700 }}>NOW</span>}
                    {prog && <span style={{ fontSize: 9, opacity: 0.7 }}>{prog.pct}%</span>}
                  </button>
                )
              })}
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={sectionLabel}>Phase {activeChecklistPhase}: {PHASE_LABELS[activeChecklistPhase].title}</div>
                  <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 2 }}>{PHASE_LABELS[activeChecklistPhase].standard} · Goal: {PHASE_LABELS[activeChecklistPhase].goal}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                  <div style={{ fontSize: 22, fontWeight: 600, color: PHASE_COLORS[activeChecklistPhase] }}>
                    {currentPhaseProgress?.pct ?? 0}%
                  </div>
                  <div style={{ fontSize: 10, color: '#6B8299' }}>
                    {currentPhaseProgress?.completed ?? 0} of {currentPhaseProgress?.total ?? 0}
                  </div>
                </div>
              </div>
              <div style={{
                background: 'rgba(201,169,110,0.04)', border: '1px solid rgba(201,169,110,0.1)',
                borderRadius: 6, padding: '12px 14px', fontSize: 12, color: '#9BB0C4', lineHeight: 1.6,
              }}>
                {PHASE_LABELS[activeChecklistPhase].description}
                <div style={{ marginTop: 8, fontSize: 11, color: '#C9A96E', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <span style={{ flexShrink: 0 }}>→</span>
                  <span>{PHASE_LABELS[activeChecklistPhase].nextStep}</span>
                </div>
              </div>

              {/* Time in Phase indicator — only for phases with defined timelines */}
              {activeChecklistPhase === data.phase && data.phaseStartedAt && PHASE_EXPECTED_DAYS[data.phase] && (() => {
                const expectedDays = PHASE_EXPECTED_DAYS[data.phase]
                const daysIn = Math.max(0, Math.floor((Date.now() - new Date(data.phaseStartedAt).getTime()) / (1000 * 60 * 60 * 24)))
                const timePct = Math.min(100, Math.round((daysIn / expectedDays) * 100))
                const isOverdue = daysIn > expectedDays
                const isNearing = daysIn > expectedDays * 0.75 && !isOverdue
                const barColor = isOverdue ? '#f87171' : isNearing ? '#f59e0b' : '#4ade80'
                const daysLeft = Math.max(0, expectedDays - daysIn)

                return (
                  <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#9BB0C4', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        Time in Phase
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: barColor }}>
                        {isOverdue
                          ? `${daysIn - expectedDays} days over target`
                          : daysLeft === 0
                            ? 'Target day'
                            : `${daysLeft} days remaining`
                        }
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                        <div style={{
                          height: '100%', borderRadius: 3,
                          width: `${timePct}%`,
                          background: barColor,
                          transition: 'width 0.5s, background 0.3s',
                        }} />
                        {!isOverdue && (
                          <div style={{
                            position: 'absolute', top: -2, bottom: -2,
                            left: '75%', width: 1,
                            background: 'rgba(245,158,11,0.4)',
                          }} />
                        )}
                      </div>
                      <span style={{ fontSize: 10, color: '#6B8299', flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
                        Day {daysIn} / {expectedDays}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginBottom: 24, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                // Defensive clamp — even if the server math drifts, the
                // bar never overflows its container. overflow:hidden on
                // the parent is a second line of defense.
                width: `${Math.min(100, currentPhaseProgress?.pct ?? 0)}%`,
                background: PHASE_COLORS[activeChecklistPhase], borderRadius: 3, transition: 'width 0.5s',
              }} />
            </div>

            {/* Expand all / Collapse all */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
              <button
                onClick={() => expandAll(activeChecklistPhase)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: '#6B8299',
                }}
              >
                Expand all
              </button>
              <span style={{ color: '#4B5563', fontSize: 10 }}>|</span>
              <button
                onClick={collapseAll}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: '#6B8299',
                }}
              >
                Collapse all
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Render items grouped by group key */}
              {(() => {
                const allItems = effectivePhaseItems[activeChecklistPhase] ?? []
                const groups = effectivePhaseGroups[activeChecklistPhase] ?? []

                // Build ordered groups: items with matching group key, plus ungrouped items
                const groupedItems: { group: (typeof groups)[number] | null; items: typeof allItems }[] = []
                const usedKeys = new Set<string>()

                for (const g of groups) {
                  const gItems = allItems.filter(i => i.group === g.key)
                  if (gItems.length > 0) {
                    groupedItems.push({ group: g, items: gItems })
                    gItems.forEach(i => usedKeys.add(i.key))
                  }
                }
                // Any items without a group go at the end
                const ungrouped = allItems.filter(i => !usedKeys.has(i.key))
                if (ungrouped.length > 0) {
                  groupedItems.push({ group: null, items: ungrouped })
                }

                return groupedItems.map(({ group, items: groupItems }) => {
                  const groupCompleted = groupItems.filter(item => {
                    if (item.key === 'connect_discord') return !!data.discordUserId
                    return currentPhaseItems.some(i => i.itemKey === item.key && i.completed)
                  }).length

                  const isGroupCollapsed = group ? collapsedGroups.has(group.key) : false
                  const GroupIcon = group?.icon ? GROUP_ICONS[group.icon] : null

                  return (
                    <div key={group?.key ?? 'ungrouped'}>
                      {/* Group header */}
                      {group && (
                        <div
                          onClick={() => {
                            setCollapsedGroups(prev => {
                              const next = new Set(prev)
                              if (next.has(group.key)) next.delete(group.key)
                              else next.add(group.key)
                              return next
                            })
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 14px', marginBottom: isGroupCollapsed ? 0 : 6, cursor: 'pointer',
                            background: 'rgba(201,169,110,0.04)',
                            border: '1px solid rgba(201,169,110,0.1)',
                            borderRadius: 6,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {GroupIcon && <GroupIcon size={16} color="#C9A96E" />}
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>
                                {group.label}
                              </div>
                              {group.description && !isGroupCollapsed && (
                                <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>{group.description}</div>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              color: groupCompleted === groupItems.length ? '#4ade80' : '#C9A96E',
                            }}>
                              {groupCompleted}/{groupItems.length}
                            </span>
                            <span style={{
                              width: 40, height: 4, borderRadius: 2,
                              background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                              display: 'inline-block',
                            }}>
                              <span style={{
                                display: 'block', height: '100%',
                                width: `${groupItems.length > 0 ? Math.round((groupCompleted / groupItems.length) * 100) : 0}%`,
                                background: groupCompleted === groupItems.length ? '#4ade80' : '#C9A96E',
                                borderRadius: 2,
                                transition: 'width 0.3s',
                              }} />
                            </span>
                            <ChevronDown size={14} color="#6B8299" style={{ transition: 'transform 0.2s', transform: isGroupCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                          </div>
                        </div>
                      )}

                      {/* Trainer display at group level */}
                      {group?.showTrainer && data.cft && !isGroupCollapsed && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 14px', marginBottom: 4,
                          background: 'rgba(201,169,110,0.04)',
                          borderRadius: 4,
                        }}>
                          <UserCheck size={13} color="#C9A96E" />
                          <span style={{ fontSize: 11, color: '#C9A96E' }}>Your trainer: {data.cft}</span>
                        </div>
                      )}

                      {/* Consolidated coordinator panel for licensing group */}
                      {group?.key === 'licensing' && !isGroupCollapsed && (
                        <LicensingCoordinatorPanel
                          items={groupItems.filter(i => i.coordinatorTopic)}
                          phaseItems={currentPhaseItems}
                          requests={coordinatorRequests}
                          calendarUrl={lcCalendarUrl}
                          onRequestHelp={(itemKey) => setRequestModalItemKey(itemKey)}
                        />
                      )}

                      {/* Banner videos at the top of this step. Set by
                          admins in /vault/checklist-editor — primarily
                          Melinee's "Welcome to Step N" intros, but any
                          per-step content can land here. Hidden when
                          the group is collapsed so it doesn't compete
                          with the closed-group summary line. */}
                      {!isGroupCollapsed && group && 'videos' in group && Array.isArray((group as GroupWithVideos).videos) && (group as GroupWithVideos).videos.length > 0 && (
                        <div style={{
                          margin: '6px 0 10px',
                          display: 'flex', flexDirection: 'column', gap: 8,
                        }}>
                          {(group as GroupWithVideos).videos.map((v, idx) => (
                            <ChecklistItemVideo
                              key={`${group.key}-video-${idx}`}
                              videoUrl={v.url}
                              videoTitle={v.title}
                              orientation={v.orientation}
                            />
                          ))}
                        </div>
                      )}

                      {/* Items in this group — hidden when collapsed */}
                      {!isGroupCollapsed && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {groupItems.filter(item => !(group?.key === 'licensing' && item.coordinatorTopic)).map(item => {
                const phaseItem = currentPhaseItems.find(i => i.itemKey === item.key)
                // Auto-complete connect_discord when Discord is linked
                const done = item.key === 'connect_discord'
                  ? !!data.discordUserId
                  : (phaseItem?.completed ?? false)
                const isToggling = togglingKey === item.key
                const isExpanded = expandedItems.has(item.key)

                return (
                  <div key={item.key} data-item-key={item.key} style={{
                    borderRadius: 6, overflow: 'hidden',
                    transition: 'box-shadow 0.3s',
                    boxShadow: highlightKey === item.key ? '0 0 0 2px #C9A96E, 0 0 20px rgba(201,169,110,0.3)' : 'none',
                    animation: highlightKey === item.key ? 'aff-highlight-pulse 1s ease-in-out 2' : 'none',
                  }}>
                    {/* Card row — clicking ANYWHERE on the card expands/collapses.
                        The checkbox is a separate click target that stops propagation. */}
                    <div
                      onClick={() => toggleExpanded(item.key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 16px',
                        background: done ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${done ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.05)'}`,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        borderRadius: isExpanded ? '6px 6px 0 0' : '6px',
                      }}
                    >
                      {/* Checkbox — click stops propagation so it only toggles completion */}
                      <button
                        onClick={e => { e.stopPropagation(); const hasSlots = !!(item as typeof item & { slots?: SlotDef[] }).slots?.length; if (!item.adminOnly && !hasSlots) toggleItem(item.key, activeChecklistPhase, done) }}
                        disabled={isToggling || item.adminOnly || !!(item as typeof item & { slots?: SlotDef[] }).slots?.length}
                        title={item.adminOnly ? 'This item is approved by leadership' : undefined}
                        style={{
                          background: 'none', border: 'none', padding: 0,
                          cursor: item.adminOnly ? 'default' : isToggling ? 'not-allowed' : 'pointer',
                          opacity: item.adminOnly ? 0.5 : isToggling ? 0.6 : 1, flexShrink: 0,
                        }}
                      >
                        <div style={{
                          width: 20, height: 20, borderRadius: 4,
                          background: done ? '#4ade80' : 'transparent',
                          border: `2px solid ${done ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: '#0A1628', fontWeight: 700,
                          transition: 'all 0.15s',
                        }}>
                          {done && '✓'}
                        </div>
                      </button>
                      <span style={{ fontSize: 13, color: done ? '#9BB0C4' : '#ffffff', flex: 1 }}>
                        {item.label}
                        {(() => {
                          // For fta_1..fta_10 items, show the linked FTA
                          // contact name from the PhaseItem's direct linkedFta relation.
                          if (!done) return null
                          if (!item.key.match(/^fta_(\d+)$/)) return null
                          const pi = currentPhaseItems.find(p => p.itemKey === item.key)
                          const linkedFta = (pi as { linkedFta?: { id: string; name: string; businessPartner?: { id: string; name: string } | null } })?.linkedFta
                          // Fallback to completedFtas array for legacy data without linkedFtaId
                          const ftaIdx = parseInt(item.key.split('_')[1], 10) - 1
                          const legacyFta = !linkedFta ? data.completedFtas?.[ftaIdx] : null
                          const fta = linkedFta ? { id: linkedFta.id, name: linkedFta.name, businessPartner: linkedFta.businessPartner, notes: null as string | null } : legacyFta
                          if (!fta) return null
                          const display = fta.businessPartner?.name ?? fta.name
                          if (!display) return null
                          return (
                            <>
                              <span style={{ marginLeft: 8, fontSize: 11, color: '#9B6DFF', fontWeight: 500 }}>
                                &middot; {display}
                              </span>
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  setFtaEditId(prev => prev === fta.id ? null : fta.id)
                                  setFtaEditDraft({ status: 'COMPLETED', notes: fta.notes ?? '', businessPartnerId: fta.businessPartner?.id ?? '' })
                                  fetch(`/api/agents/partners?category=fta_contact${previewToken ? `&preview=${previewToken}` : ''}`)
                                    .then(r => r.ok ? r.json() : { partners: [] })
                                    .then((d: { partners: { id: string; name: string }[] }) => setFtaContacts(d.partners ?? []))
                                    .catch(() => {})
                                }}
                                title="Reopen this appointment, change its status, or update the notes"
                                style={{ marginLeft: 6, background: 'transparent', border: '1px solid rgba(155,109,255,0.3)', color: '#9B6DFF', borderRadius: 3, padding: '1px 7px', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
                              >
                                {ftaEditId === fta.id ? 'Close' : 'Update'}
                              </button>
                            </>
                          )
                        })()}
                      </span>
                      {item.duration && (
                        <span style={{ fontSize: 9, color: '#6B8299', flexShrink: 0, padding: '2px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 3 }}>
                          {item.duration}
                        </span>
                      )}
                      {item.coordinatorTopic && (
                        <button
                          onClick={e => { e.stopPropagation(); setRequestModalItemKey(item.key) }}
                          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid rgba(201,169,110,0.3)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', color: '#C9A96E', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                          title="Request help from the licensing coordinator"
                        >
                          <Mail size={11} color="#C9A96E" /> Get Help
                        </button>
                      )}
                      {phaseItem?.linkedAgentProfile && (
                        <span
                          title={`Linked to ${phaseItem.linkedAgentProfile.firstName} ${phaseItem.linkedAgentProfile.lastName} (${phaseItem.linkedAgentProfile.agentCode})${phaseItem.linkedAgentProfile.status === 'INACTIVE' ? ' · inactive' : ''}`}
                          style={{
                            fontSize: 10, fontWeight: 600, color: '#4ADE80',
                            background: 'rgba(74,222,128,0.08)',
                            border: '1px solid rgba(74,222,128,0.25)',
                            padding: '2px 8px', borderRadius: 999, flexShrink: 0,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180,
                            opacity: phaseItem.linkedAgentProfile.status === 'INACTIVE' ? 0.7 : 1,
                          }}
                        >
                          &#10003; {phaseItem.linkedAgentProfile.firstName} {phaseItem.linkedAgentProfile.lastName}
                        </span>
                      )}
                      {phaseItem?.completedAt && (
                        <span style={{ fontSize: 10, color: '#4B5563', flexShrink: 0 }}>
                          {new Date(phaseItem.completedAt).toLocaleDateString()}
                        </span>
                      )}
                      <ChevronDown size={13} color="#4B5563" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                      {item.action?.type === 'navigate-tab' && item.action.tab && (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            if (item.action!.tab === 'pfr') { window.location.href = `/agents/pfr${previewToken ? `?preview=${encodeURIComponent(previewToken)}` : ''}`; return }
                            goToTab(item.action!.tab as typeof activeTab)
                          }}
                          style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 10, cursor: 'pointer', padding: '0 4px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}
                          title={item.action.label ?? `Go to ${item.action.tab}`}
                        >
                          {item.action.label ?? item.action.tab} <ArrowRight size={11} />
                        </button>
                      )}
                      {item.action?.type === 'resource-link' && (() => {
                        const url = setupResources[item.action!.resourceKey!]
                        if (!url) return null
                        return (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ color: '#C9A96E', fontSize: 10, textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}
                          >
                            {item.action!.label ?? 'Open'} <ExternalLink size={11} />
                          </a>
                        )
                      })()}
                      {item.action?.type === 'claim-recruit' && (
                        <button
                          onClick={e => { e.stopPropagation(); setRecruitClaimItemKey(item.key) }}
                          style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 10, cursor: 'pointer', padding: '0 4px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}
                          title={item.action.label ?? 'Pick recruit'}
                        >
                          {phaseItem?.linkedAgentProfile ? 'Change' : (item.action.label ?? 'Pick recruit')} <ArrowRight size={11} />
                        </button>
                      )}
                      {item.action?.type === 'inline-form' && (() => {
                        if (item.action!.modal === 'promotion-request') {
                          if (done) return <span style={{ fontSize: 10, color: '#4ade80', flexShrink: 0, padding: '2px 10px', background: 'rgba(74,222,128,0.1)', borderRadius: 10 }}>Approved</span>
                          const pendingReq = coordinatorRequests.find(r => r.phaseItemKey === item.key && (r.status === 'OPEN' || r.status === 'IN_PROGRESS'))
                          if (pendingReq) return <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', flexShrink: 0, padding: '2px 10px', background: 'rgba(245,158,11,0.1)', borderRadius: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Pending Approval</span>
                          const allPhaseItems = effectivePhaseItems[activeChecklistPhase] ?? []
                          const itemIndex = allPhaseItems.findIndex(i => i.key === item.key)
                          const prerequisiteItems = allPhaseItems.slice(0, itemIndex).filter(i => !i.adminOnly)
                          const allDone = prerequisiteItems.every(i => {
                            if (i.key === 'connect_discord') return !!data.discordUserId
                            return currentPhaseItems.some(pi => pi.itemKey === i.key && pi.completed)
                          })
                          if (!allDone) return <span style={{ fontSize: 9, color: '#4B5563', flexShrink: 0 }}>Complete all items above first</span>
                        }
                        return (
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              if (item.action!.modal === 'fta-schedule') {
                                // Schedule action takes the agent into the FTA Tracker tab
                                // where they can book and track real appointments instead
                                // of capturing a one-shot record via a modal.
                                goToTab('fta')
                              } else if (item.action!.modal === 'fta-log') {
                                setFtaModalKey(item.key)
                              } else if (item.action!.modal === 'promotion-request') {
                                setPromotionRequestKey(item.key)
                              }
                            }}
                            style={{ background: 'none', border: 'none', color: '#C9A96E', fontSize: 10, cursor: 'pointer', padding: '0 4px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}
                          >
                            {item.action!.label ?? 'Open'} <ArrowRight size={11} />
                          </button>
                        )
                      })()}
                    </div>
                    {/* Inline FTA editor — opens when "Update" is tapped
                        on a fta_N item. Lets the agent change status
                        (re-open, mark cancelled, etc.) and edit notes
                        without going to the FTA Tracker tab. */}
                    {(() => {
                      if (!item.key.match(/^fta_(\d+)$/)) return null
                      const pi2 = currentPhaseItems.find(p => p.itemKey === item.key)
                      const lf = (pi2 as { linkedFta?: { id: string; name: string; businessPartner?: { id: string; name: string } | null } })?.linkedFta
                      const ftaIdx2 = parseInt(item.key.split('_')[1], 10) - 1
                      const fta = lf ? { id: lf.id, name: lf.name, businessPartner: lf.businessPartner, notes: null as string | null } : data.completedFtas?.[ftaIdx2]
                      if (!fta || ftaEditId !== fta.id) return null
                      const saveFta = async () => {
                        setFtaEditSaving(true)
                        try {
                          const payload: Record<string, unknown> = {
                            status: ftaEditDraft.status,
                            notes: ftaEditDraft.notes.trim() || null,
                          }
                          if (ftaEditDraft.businessPartnerId && ftaEditDraft.businessPartnerId !== (fta.businessPartner?.id ?? '')) {
                            payload.businessPartnerId = ftaEditDraft.businessPartnerId
                          }
                          const res = await fetch(`/api/agents/fta/${fta.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                          })
                          if (res.ok) {
                            setFtaEditId(null)
                            await fetchData()
                          }
                        } finally { setFtaEditSaving(false) }
                      }
                      return (
                        <div style={{
                          margin: '8px 0 4px 46px',
                          padding: '10px 12px',
                          background: 'rgba(155,109,255,0.05)',
                          border: '1px solid rgba(155,109,255,0.25)',
                          borderRadius: 4,
                        }}>
                          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#9B6DFF', marginBottom: 6 }}>
                            Update appointment &middot; {fta.businessPartner?.name ?? fta.name}
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 140px' }}>
                              <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9BB0C4', display: 'block', marginBottom: 3 }}>Status</label>
                              <select
                                value={ftaEditDraft.status}
                                onChange={e => setFtaEditDraft(d => ({ ...d, status: e.target.value }))}
                                style={{ width: '100%', boxSizing: 'border-box', background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', color: '#d1d9e2', borderRadius: 4, padding: '6px 8px', fontSize: 11 }}
                              >
                                <option value="COMPLETED">Completed</option>
                                <option value="SCHEDULED">Re-open · Scheduled</option>
                                <option value="RESCHEDULED">Rescheduled</option>
                                <option value="CANCELLED">Cancelled</option>
                                <option value="NO_SHOW">No-show</option>
                              </select>
                            </div>
                            <div style={{ flex: '1 1 180px' }}>
                              <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9BB0C4', display: 'block', marginBottom: 3 }}>Contact</label>
                              <select
                                value={ftaEditDraft.businessPartnerId}
                                onChange={e => setFtaEditDraft(d => ({ ...d, businessPartnerId: e.target.value }))}
                                style={{ width: '100%', boxSizing: 'border-box', background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', color: '#d1d9e2', borderRadius: 4, padding: '6px 8px', fontSize: 11 }}
                              >
                                <option value="">— No contact linked —</option>
                                {ftaContacts.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9BB0C4', display: 'block', marginBottom: 3 }}>Notes</label>
                          <textarea
                            value={ftaEditDraft.notes}
                            onChange={e => setFtaEditDraft(d => ({ ...d, notes: e.target.value }))}
                            rows={3}
                            placeholder="Append a follow-up note, recap of the call, next steps..."
                            style={{ width: '100%', boxSizing: 'border-box', background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', color: '#d1d9e2', borderRadius: 4, padding: '6px 8px', fontSize: 11, fontFamily: 'inherit', resize: 'vertical' }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                            <button
                              onClick={() => setFtaEditId(null)}
                              disabled={ftaEditSaving}
                              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', borderRadius: 4, padding: '4px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
                            >Cancel</button>
                            <button
                              onClick={saveFta}
                              disabled={ftaEditSaving}
                              style={{ background: '#9B6DFF', color: '#0A1628', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: ftaEditSaving ? 'wait' : 'pointer' }}
                            >{ftaEditSaving ? 'Saving...' : 'Save'}</button>
                          </div>
                          <div style={{ fontSize: 9, color: '#6B8299', marginTop: 6, fontStyle: 'italic' }}>
                            Changing the status away from Completed will untick this item from your checklist count.
                          </div>
                        </div>
                      )
                    })()}
                    {/* Expanded description */}
                    {isExpanded && (() => {
                      return (
                        <div style={{
                          padding: '12px 16px 14px 46px',
                          background: done ? 'rgba(74,222,128,0.03)' : 'rgba(255,255,255,0.01)',
                          border: `1px solid ${done ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)'}`,
                          borderTop: 'none',
                          borderRadius: '0 0 6px 6px',
                        }}>
                          <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.6 }}>
                            <MarkdownDescription text={item.description} />
                          </div>

                          {/* Walkthrough videos — admins attach one or more
                              Loom share URLs / uploaded videos on the phase
                              item; we render each as an expandable player.
                              Falls back to the legacy single-video field for
                              items that predate the multi-video migration. */}
                          {(item.videos && item.videos.length > 0
                            ? item.videos
                            : item.videoUrl
                              ? [{ url: item.videoUrl, title: item.videoTitle ?? null }]
                              : []
                          ).map((v, i) => (
                            <ChecklistItemVideo
                              key={`${v.url}-${i}`}
                              videoUrl={v.url}
                              videoTitle={v.title ?? null}
                            />
                          ))}


                          {/* Milestone slots — shown when admin has defined linkable slots on this item */}
                          {(item as typeof item & { slots?: SlotDef[] }).slots?.length ? (
                            <ItemSlots
                              itemKey={item.key}
                              slots={(item as typeof item & { slots?: SlotDef[] }).slots!}
                              fulfillments={data.slotFulfillments ?? []}
                              onFulfillmentChange={() => {
                                fetch('/api/agents/me').then(r => r.ok ? r.json() : null).then(d => {
                                  if (d) setData(d)
                                }).catch(() => {})
                              }}
                            />
                          ) : null}

                          {/* Coordinator request — inline CTAs for items with coordinatorTopic. */}
                          {/* Two paths: an async message (modal) or a synchronous calendar booking. */}
                          {/* Most agents do best with one or the other, so surfacing both removes a step. */}
                          {item.coordinatorTopic && (
                            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed rgba(201,169,110,0.2)' }}>
                              <div style={{ fontSize: 11, color: '#9BB0C4', marginBottom: 8 }}>
                                Need help with this step?
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                  onClick={e => { e.stopPropagation(); setRequestModalItemKey(item.key) }}
                                  style={{
                                    flex: '1 1 200px',
                                    background: 'rgba(201,169,110,0.08)',
                                    border: '1px solid rgba(201,169,110,0.3)',
                                    borderRadius: 6, padding: '12px 16px',
                                    cursor: 'pointer', color: '#C9A96E',
                                    fontSize: 12, fontWeight: 600,
                                    display: 'flex', alignItems: 'center', gap: 8,
                                  }}
                                >
                                  <Mail size={15} color="#C9A96E" />
                                  Message the coordinator
                                </button>
                                <a
                                  href={lcCalendarUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  style={{
                                    flex: '1 1 200px',
                                    background: 'rgba(96,165,250,0.08)',
                                    border: '1px solid rgba(96,165,250,0.3)',
                                    borderRadius: 6, padding: '12px 16px',
                                    color: '#60A5FA',
                                    fontSize: 12, fontWeight: 600,
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    textDecoration: 'none',
                                  }}
                                >
                                  <span style={{ fontSize: 14 }}>📅</span>
                                  Schedule time on their calendar
                                </a>
                              </div>
                            </div>
                          )}

                          {/* Discord connect — inline action for connect_discord item */}
                          {item.key === 'connect_discord' && (
                            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed rgba(155,109,255,0.2)' }}>
                              {data.discordUserId ? (
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '12px 14px',
                                  background: 'rgba(74,222,128,0.06)',
                                  border: '1px solid rgba(74,222,128,0.25)',
                                  borderRadius: 6,
                                }}>
                                  <div style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: 'rgba(74,222,128,0.15)',
                                    border: '1px solid rgba(74,222,128,0.4)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 14, color: '#4ade80',
                                  }}>
                                    ✓
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#4ade80' }}>Discord connected</div>
                                    <div style={{ fontSize: 10, color: '#6B8299', marginTop: 1 }}>
                                      {data.discordRoleName && <span>Role: {data.discordRoleName} · </span>}
                                      ID: {data.discordUserId}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <a
                                  href="/api/agents/discord-connect"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 10,
                                    padding: '14px 20px',
                                    background: 'linear-gradient(135deg, #5865F2, #4752C4)',
                                    color: '#ffffff',
                                    border: 'none', borderRadius: 8,
                                    fontSize: 13, fontWeight: 700,
                                    textDecoration: 'none',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 16px rgba(88,101,242,0.35)',
                                    transition: 'all 0.15s',
                                    minHeight: 48,
                                  }}
                                >
                                  <svg width="20" height="16" viewBox="0 0 71 55" fill="white">
                                    <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 41 41 0 00-1.8 3.7 54 54 0 00-16.2 0A37 37 0 0025.4.3a.2.2 0 00-.2-.1A58.4 58.4 0 0010.5 5a.2.2 0 00-.1 0C1.5 17.7-.9 30 .3 42.1a.2.2 0 000 .2 58.7 58.7 0 0017.7 9 .2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.7 38.7 0 01-5.5-2.6.2.2 0 01 0-.4 31 31 0 001.1-.9.2.2 0 01.2 0c11.6 5.3 24.1 5.3 35.5 0a.2.2 0 01.2 0 29 29 0 001.1.9.2.2 0 010 .3 36.3 36.3 0 01-5.5 2.6.2.2 0 00-.1.4 47 47 0 003.6 5.8.2.2 0 00.2.1 58.5 58.5 0 0017.7-9 .2.2 0 000-.1c1.4-14.5-2.4-27.1-10-38.3a.2.2 0 00-.1 0zM23.7 34.6c-3.3 0-6-3-6-6.8s2.7-6.8 6-6.8 6.1 3.1 6 6.8c0 3.7-2.6 6.8-6 6.8zm22.2 0c-3.3 0-6-3-6-6.8s2.6-6.8 6-6.8 6 3.1 6 6.8c0 3.7-2.6 6.8-6 6.8z"/>
                                  </svg>
                                  Connect Discord
                                </a>
                              )}
                              {!data.discordUserId && <DiscordVerifyHint />}
                            </div>
                          )}


                        </div>
                      )
                    })()}
                  </div>
                )
              })}
                      </div>}{/* close items in group */}
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        )}

        {/* ── LICENSING CHECKLIST TAB ── */}
        {activeTab === 'licensing' && (
          <LicensingTab
            phaseItems={data.phaseItems}
            carrierAppointments={data.carrierAppointments}
            onToggle={toggleItem}
            togglingKey={togglingKey}
          />
        )}

        {/* ── CARRIERS TAB ── */}
        {activeTab === 'carriers' && (
          <CarriersTab
            isMobile={isMobile}
            agentPhase={data.phase}
            carrierAppointments={data.carrierAppointments}
            selectedCarriers={data.selectedCarriers}
            onSelectedChanged={fetchData}
          />
        )}

        {/* ── PARTNERS / CALLS / PROFILE TABS ── */}
        {activeTab === 'partners' && <BusinessPartnersTab isMobile={isMobile} previewToken={previewToken} />}
        {activeTab === 'fta' && <FtaTab isMobile={isMobile} previewToken={previewToken} />}
        {activeTab === 'new-business' && (
          <NewBusinessTab
            isMobile={isMobile}
            phase={data.phase}
            initialSubmissionId={submissionParam}
            previewToken={previewToken}
          />
        )}
        {activeTab === 'calls' && <CallLogsTab hasCft={(data.badges ?? []).includes('CFT')} previewToken={previewToken} />}
        {activeTab === 'climb' && <ClimbTab isMobile={isMobile} previewToken={previewToken} />}
        {activeTab === 'team' && <MyTeamTab isMobile={isMobile} previewToken={previewToken} />}
        {activeTab === 'profile' && (
          <ProfileTab
            data={data}
            onSaved={fetchData}
            discordParam={discordParam}
            discordReason={discordReason}
            discordUsername={discordUsername}
            isMobile={isMobile}
          />
        )}

      </div>

      {/* Licensing coordinator request modal */}
      {requestModalItemKey && (() => {
        const item = effectivePhaseItems[activeChecklistPhase]?.find(i => i.key === requestModalItemKey)
          ?? Object.values(PHASE_ITEMS).flat().find(i => i.key === requestModalItemKey)
        if (!item || !item.coordinatorTopic) return null
        const itemRequests = coordinatorRequests.filter(r => r.phaseItemKey === item.key)
        return (
          <LicensingRequestModal
            phaseItemKey={item.key}
            phaseItemLabel={item.label}
            calendarUrl={lcCalendarUrl}
            defaultTopic={item.coordinatorTopic as LicensingRequestTopic}
            existingRequests={itemRequests.map(r => ({
              ...r,
              topic: r.topic as LicensingRequestTopic,
            }))}
            previewToken={previewToken}
            onClose={() => setRequestModalItemKey(null)}
            onSubmitted={newReq => {
              setCoordinatorRequests(prev => [
                {
                  id: newReq.id,
                  phaseItemKey: newReq.phaseItemKey ?? null,
                  topic: newReq.topic as string,
                  message: newReq.message,
                  status: newReq.status,
                  resolutionNote: newReq.resolutionNote,
                  createdAt: newReq.createdAt,
                  resolvedAt: newReq.resolvedAt,
                },
                ...prev,
              ])
            }}
          />
        )
      })()}

      {recruitClaimItemKey && (() => {
        // Find the item def for the modal label.
        const item = effectivePhaseItems[activeChecklistPhase]?.find(i => i.key === recruitClaimItemKey)
          ?? Object.values(PHASE_ITEMS).flat().find(i => i.key === recruitClaimItemKey)
        if (!item) return null
        // Block double-claiming the same recruit across direct_1/2/3.
        const otherClaimed = data.phaseItems
          .filter(pi => pi.itemKey !== recruitClaimItemKey && pi.linkedAgentProfileId)
          .map(pi => pi.linkedAgentProfileId as string)
        return (
          <RecruitClaimModal
            itemKey={recruitClaimItemKey}
            itemLabel={item.label}
            previewToken={previewToken}
            alreadyClaimedProfileIds={otherClaimed}
            onClose={() => setRecruitClaimItemKey(null)}
            onReferNew={() => { goToTab('partners') }}
            onClaimed={result => {
              // Optimistically reflect the claim into local state so the
              // checkbox flips green and the chip appears without a full
              // refetch. Replace the existing PhaseItem row if present,
              // otherwise append.
              const linked = {
                id: result.recruit.id,
                firstName: result.recruit.firstName,
                lastName: result.recruit.lastName,
                agentCode: result.recruit.agentCode,
                status: result.recruit.status as 'ACTIVE' | 'INACTIVE',
                avatarUrl: null,
              }
              setData(prev => {
                if (!prev) return prev
                // This handler only runs from a direct_N phase-item
                // claim — itemKey is always set here. Bail with no
                // change in the team-only mode case (which doesn't
                // route through this modal instance).
                const claimedItemKey = result.itemKey
                if (!claimedItemKey) return prev
                const idx = prev.phaseItems.findIndex(pi => pi.itemKey === claimedItemKey && pi.phase === 2)
                const next = [...prev.phaseItems]
                const nowIso = new Date().toISOString()
                if (idx >= 0) {
                  next[idx] = { ...next[idx], completed: true, completedAt: nowIso, linkedAgentProfileId: result.linkedAgentProfileId, linkedAgentProfile: linked }
                } else {
                  next.push({ phase: 2, itemKey: claimedItemKey, completed: true, completedAt: nowIso, linkedAgentProfileId: result.linkedAgentProfileId, linkedAgentProfile: linked })
                }
                return { ...prev, phaseItems: next }
              })
              setRecruitClaimItemKey(null)
            }}
          />
        )
      })()}

      {/* Promotion Celebration Overlay */}
      {showPromotion && (
        <div
          onClick={() => setShowPromotion(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 420, padding: 32 }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%', margin: '0 auto 20px',
              background: 'rgba(201,169,110,0.15)',
              border: '2px solid #C9A96E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, animation: 'aff-pulse 1.5s ease-in-out infinite',
            }}>
              <span style={{ color: '#C9A96E' }}>&#9733;</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 8 }}>
              Congratulations!
            </div>
            <div style={{ fontSize: 16, color: '#C9A96E', fontWeight: 600, marginBottom: 12 }}>
              You&apos;ve been promoted to Phase {showPromotion}: {PHASE_LABELS[showPromotion]?.title}
            </div>
            <div style={{ fontSize: 13, color: '#9BB0C4', lineHeight: 1.6, marginBottom: 24 }}>
              {PHASE_LABELS[showPromotion]?.description}
            </div>
            <button
              onClick={() => setShowPromotion(null)}
              style={{
                background: '#C9A96E', color: '#142D48', border: 'none',
                borderRadius: 6, padding: '14px 32px', fontSize: 13,
                fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}
            >
              Let&apos;s Go
            </button>
          </div>
          <style>{`
            @keyframes aff-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
          `}</style>
        </div>
      )}

      {/* FTA Log Modal */}
      {ftaModalKey && (() => {
        const item = Object.values(PHASE_ITEMS).flat().find(i => i.key === ftaModalKey)
        if (!item) return null
        return (
          <FTALogModal
            ftaKey={item.key}
            ftaLabel={item.label}
            trainerName={data.cft}
            defaultName={item.key === 'fta_1' ? '' : undefined}
            onClose={() => setFtaModalKey(null)}
            onSaved={fetchData}
          />
        )
      })()}

      <FeedbackButton />

      {/* Promotion Request Modal */}
      {promotionRequestKey && (
        <div
          onClick={() => setPromotionRequestKey(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: '#132238', border: '1px solid rgba(201,169,110,0.15)',
            borderRadius: 8, width: '100%', maxWidth: 420, padding: 24,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 12, color: '#C9A96E' }}>&#9733;</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', marginBottom: 8 }}>
              Request Senior Associate Promotion
            </div>
            <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.6, marginBottom: 20 }}>
              You&apos;ve completed all the required items. Submit your promotion request for leadership review. Once approved, you&apos;ll receive your Senior Associate designation.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={() => setPromotionRequestKey(null)}
                style={{
                  padding: '10px 20px', borderRadius: 4, fontSize: 12,
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#9BB0C4', cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                disabled={promotionRequesting}
                onClick={async () => {
                  setPromotionRequesting(true)
                  const res = await fetch('/api/agents/coordinator-requests', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      phaseItemKey: promotionRequestKey,
                      topic: 'GENERAL',
                      message: `I have completed all required items for Phase ${data.phase} and would like to request my Senior Associate Promotion.`,
                    }),
                  })
                  if (res.ok) {
                    const d = await res.json() as { request?: { id: string; phaseItemKey: string | null; topic: string; message: string; status: string; resolutionNote: string | null; createdAt: string; resolvedAt: string | null } }
                    if (d.request) {
                      setCoordinatorRequests(prev => [{
                        id: d.request!.id,
                        phaseItemKey: d.request!.phaseItemKey ?? null,
                        topic: d.request!.topic,
                        message: d.request!.message,
                        status: d.request!.status as 'OPEN',
                        resolutionNote: null,
                        createdAt: d.request!.createdAt,
                        resolvedAt: null,
                      }, ...prev])
                    }
                  }
                  setPromotionRequesting(false)
                  setPromotionRequestKey(null)
                }}
                style={{
                  padding: '10px 24px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                  background: '#C9A96E', border: 'none', color: '#142D48',
                  cursor: promotionRequesting ? 'wait' : 'pointer',
                  opacity: promotionRequesting ? 0.7 : 1,
                }}
              >{promotionRequesting ? 'Submitting...' : 'Submit Request'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AgentDashboard() {
  return (
    <Suspense fallback={null}>
      <AgentDashboardInner />
    </Suspense>
  )
}

// ─── Milestone submission control ──────────────────────────────────────────────
// Renders nothing for auto-typed milestones. For submission-typed milestones:
//   - Not yet submitted: shows a small "Submit for review" affordance with an
//     optional note textarea.
//   - PENDING_REVIEW: shows a pending badge with submitted timestamp.
//   - REJECTED: shows the reviewer's note (if any) and a "Resubmit" button.
//   - AWARDED: nothing (the achieved-state copy above already handles it).

function MilestoneSubmitControl({
  milestoneKey,
  milestones,
  onSubmitted,
}: {
  milestoneKey: string
  milestones: Milestone[]
  onSubmitted: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isSubmittable(milestoneKey)) return null

  const existing = milestones.find(m => m.milestone === milestoneKey)
  if (existing?.status === 'AWARDED') return null

  const submit = async () => {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/agents/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestone: milestoneKey, note: note.trim() || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? 'Submit failed')
        return
      }
      setShowForm(false); setNote('')
      onSubmitted()
    } finally { setSaving(false) }
  }

  if (existing?.status === 'PENDING_REVIEW') {
    return (
      <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 4, fontSize: 11, color: '#F59E0B' }}>
        Pending review &middot; submitted {existing.requestedAt ? new Date(existing.requestedAt).toLocaleDateString() : ''}
      </div>
    )
  }

  if (existing?.status === 'REJECTED') {
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, fontSize: 11, color: '#EF4444' }}>
          Submission rejected.
          {existing.reviewNote && <div style={{ color: '#9BB0C4', marginTop: 4, fontStyle: 'italic' }}>&ldquo;{existing.reviewNote}&rdquo;</div>}
        </div>
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            style={{ marginTop: 8, background: 'transparent', border: '1px solid rgba(201,169,110,0.3)', color: '#C9A96E', borderRadius: 4, padding: '5px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
          >Resubmit</button>
        ) : (
          <SubmitForm note={note} setNote={setNote} saving={saving} error={error} onSubmit={submit} onCancel={() => { setShowForm(false); setError(null) }} />
        )}
      </div>
    )
  }

  // No prior submission
  return (
    <div style={{ marginTop: 10 }}>
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          style={{ background: 'transparent', border: '1px solid rgba(201,169,110,0.3)', color: '#C9A96E', borderRadius: 4, padding: '5px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
        >Submit for review</button>
      ) : (
        <SubmitForm note={note} setNote={setNote} saving={saving} error={error} onSubmit={submit} onCancel={() => { setShowForm(false); setError(null) }} />
      )}
    </div>
  )
}

function SubmitForm({
  note, setNote, saving, error, onSubmit, onCancel,
}: {
  note: string
  setNote: (v: string) => void
  saving: boolean
  error: string | null
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div style={{ marginTop: 4 }}>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Optional: add proof or context for the reviewer (e.g. AP report link, names of certified trainees)..."
        style={{ width: '100%', boxSizing: 'border-box', background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', color: '#d1d9e2', borderRadius: 4, padding: '8px 10px', fontSize: 11, fontFamily: 'inherit', minHeight: 60, resize: 'vertical' }}
      />
      {error && <div style={{ marginTop: 4, fontSize: 10, color: '#EF4444' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={saving} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', borderRadius: 4, padding: '5px 12px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
        <button onClick={onSubmit} disabled={saving} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Submitting...' : 'Send for review'}</button>
      </div>
    </div>
  )
}

// ─── Licensing Checklist Tab ───────────────────────────────────────────────────

function LicensingTab({
  phaseItems,
  carrierAppointments,
  onToggle,
  togglingKey,
}: {
  phaseItems: PhaseItem[]
  carrierAppointments: CarrierAppointment[]
  onToggle: (key: string, phase: number, current: boolean) => void
  togglingKey: string | null
}) {
  const someAppointed = carrierAppointments.some(c => c.status === 'APPOINTED')

  const isItemDone = (item: typeof LICENSING_CHECKLIST[number]) => {
    const pi = phaseItems.find(pi => pi.phase === 1 && pi.itemKey === item.phaseItemKey)
    const manuallyDone = pi?.completed ?? false
    if (item.derived === 'carriers') return manuallyDone || someAppointed
    return manuallyDone
  }

  const completed = LICENSING_CHECKLIST.filter(isItemDone).length

  return (
    <div style={{ ...card, padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={sectionLabel}>Licensing Checklist</div>
        <span style={{ fontSize: 11, color: completed === LICENSING_CHECKLIST.length ? '#4ade80' : '#f59e0b', fontWeight: 700 }}>
          {completed} / {LICENSING_CHECKLIST.length}
        </span>
      </div>

      <p style={{ fontSize: 12, color: '#6B8299', marginBottom: 20, lineHeight: 1.6 }}>
        Complete these steps once to get fully licensed and appointed. Some items overlap with your Phase 1 checklist; checking them here updates both.
      </p>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 24 }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${Math.round((completed / LICENSING_CHECKLIST.length) * 100)}%`,
          background: completed === LICENSING_CHECKLIST.length ? '#4ade80' : '#C9A96E',
          transition: 'width 0.5s',
        }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {LICENSING_CHECKLIST.map(item => {
          const isDone = isItemDone(item)
          const phaseItemKey = item.phaseItemKey
          const phase = 1
          const isToggling = togglingKey === phaseItemKey
          // Auto-checked from carrier data: still clickable so the agent can
          // pin the manual flag, but they don't NEED to. Show a small hint.
          const autoChecked = item.derived === 'carriers' && someAppointed
          const pi = phaseItems.find(pi => pi.phase === 1 && pi.itemKey === phaseItemKey)
          const manuallyDone = pi?.completed ?? false

          return (
            <div
              key={item.key}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '14px 16px', borderRadius: 6,
                background: isDone ? 'rgba(74,222,128,0.05)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isDone ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.05)'}`,
                cursor: phaseItemKey ? 'pointer' : 'default',
                opacity: isToggling ? 0.6 : 1,
                transition: 'all 0.15s',
              }}
              onClick={() => {
                if (phaseItemKey) onToggle(phaseItemKey, phase, manuallyDone)
              }}
            >
              {/* Checkbox */}
              <div style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                background: isDone ? '#4ade80' : 'transparent',
                border: `2px solid ${isDone ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, color: '#0A1628', fontWeight: 700,
              }}>
                {isDone && '✓'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: isDone ? '#9BB0C4' : '#ffffff', marginBottom: 4, fontWeight: 500 }}>
                  {item.label}
                  {autoChecked && !manuallyDone && (
                    <span style={{ marginLeft: 8, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4ADE80', fontWeight: 700 }}>
                      Auto · carrier appointed
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#6B8299', lineHeight: 1.5 }}>
                  <MarkdownDescription text={item.description} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Carriers Tab (with phase lock) ───────────────────────────────────────────

function CarriersTab({
  agentPhase,
  carrierAppointments,
  selectedCarriers,
  onSelectedChanged,
  isMobile,
}: {
  isMobile: boolean
  agentPhase: number
  carrierAppointments: CarrierAppointment[]
  selectedCarriers: string[]
  onSelectedChanged: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [pendingSelection, setPendingSelection] = useState<Set<string>>(new Set(selectedCarriers))
  const [saving, setSaving] = useState(false)

  // Sync the picker draft when the parent reloads (or when we open it).
  useEffect(() => {
    setPendingSelection(new Set(selectedCarriers))
  }, [selectedCarriers, picking])

  // The agent only sees carriers in their curated list, plus any with an
  // active LC-managed appointment so they don't lose sight of in-flight work.
  const activeStatuses = new Set(['APPOINTED', 'PENDING', 'JIT'])
  const activeCarriers = new Set(
    carrierAppointments.filter(c => activeStatuses.has(c.status)).map(c => c.carrier)
  )
  const visibleSet = new Set<string>([...selectedCarriers, ...activeCarriers])
  const visibleCarriers = CARRIERS.filter(c => visibleSet.has(c))
  const appointedCount = carrierAppointments.filter(c => c.status === 'APPOINTED').length

  // Group the visible carriers by their typical unlock phase so the order
  // mirrors the agent's progression. Empty groups are skipped entirely.
  const phaseGroups: Record<number, typeof CARRIERS[number][]> = {}
  for (const carrier of visibleCarriers) {
    const unlockPhase = CARRIER_UNLOCK_PHASE[carrier] ?? 2
    if (!phaseGroups[unlockPhase]) phaseGroups[unlockPhase] = []
    phaseGroups[unlockPhase].push(carrier)
  }

  const togglePick = (carrier: string) => {
    setPendingSelection(prev => {
      const next = new Set(prev)
      if (next.has(carrier)) next.delete(carrier)
      else next.add(carrier)
      return next
    })
  }

  const saveSelection = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/agents/profile/selected-carriers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carriers: Array.from(pendingSelection) }),
      })
      if (res.ok) {
        setPicking(false)
        onSelectedChanged()
      }
    } finally { setSaving(false) }
  }

  // First-run state: no carriers selected and no live appointments either.
  // Show a friendly opt-in card instead of an empty list.
  const isFirstRun = visibleCarriers.length === 0

  return (
    <div style={{ ...card, padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={sectionLabel}>My Carriers</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: '#6B8299' }}>
            {appointedCount} appointed &middot; {visibleCarriers.length} on your list
          </span>
          {!picking && (
            <button
              onClick={() => setPicking(true)}
              style={{ background: 'transparent', border: '1px solid rgba(201,169,110,0.3)', color: '#C9A96E', borderRadius: 4, padding: '5px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              {selectedCarriers.length > 0 ? 'Edit list' : '+ Add carriers'}
            </button>
          )}
        </div>
      </div>
      <p style={{ fontSize: 12, color: '#6B8299', marginBottom: 24, lineHeight: 1.5 }}>
        Pick the carriers you write with so this list stays focused. Your licensing coordinator manages appointments. Anything you&apos;re actually appointed with (or in flight on) stays visible regardless.
      </p>

      {picking && (
        <div style={{ marginBottom: 24, padding: '16px 18px', background: 'rgba(201,169,110,0.04)', border: '1px solid rgba(201,169,110,0.18)', borderRadius: 6 }}>
          <div style={{ ...sectionLabel, fontSize: 9, marginBottom: 10 }}>Pick your carriers</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 6 }}>
            {CARRIERS.map(c => {
              const checked = pendingSelection.has(c)
              const isActive = activeCarriers.has(c)
              return (
                <label
                  key={c}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 4,
                    background: checked ? 'rgba(201,169,110,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${checked ? 'rgba(201,169,110,0.3)' : 'rgba(255,255,255,0.05)'}`,
                    cursor: isActive ? 'not-allowed' : 'pointer',
                  }}
                  title={isActive ? 'You have an active appointment with this carrier, so it stays visible.' : undefined}
                >
                  <input
                    type="checkbox"
                    checked={checked || isActive}
                    disabled={isActive}
                    onChange={() => togglePick(c)}
                    style={{ accentColor: '#C9A96E' }}
                  />
                  <span style={{ fontSize: 12, color: checked || isActive ? '#fff' : '#9BB0C4' }}>{c}</span>
                  {isActive && (
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: '#4ADE80', marginLeft: 'auto' }}>ACTIVE</span>
                  )}
                </label>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button
              onClick={() => { setPicking(false); setPendingSelection(new Set(selectedCarriers)) }}
              disabled={saving}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', borderRadius: 4, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={saveSelection}
              disabled={saving}
              style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '7px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Saving...' : 'Save list'}
            </button>
          </div>
        </div>
      )}

      {isFirstRun && !picking ? (
        <div style={{ padding: '32px 24px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px dashed rgba(201,169,110,0.18)' }}>
          <div style={{ color: '#9BB0C4', fontSize: 13, marginBottom: 12 }}>
            You haven&apos;t picked any carriers yet.
          </div>
          <button
            onClick={() => setPicking(true)}
            style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '8px 18px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer' }}
          >
            + Pick your carriers
          </button>
        </div>
      ) : (
        [2, 3, 4, 5].map(unlockPhase => {
          const carriers = phaseGroups[unlockPhase] ?? []
          if (carriers.length === 0) return null
          const isFuture = agentPhase < unlockPhase
          const phaseLabel = PHASE_LABELS[unlockPhase]?.title ?? `Phase ${unlockPhase}`

          return (
            <div key={unlockPhase} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: isFuture ? '#6B8299' : '#C9A96E',
                }}>
                  Phase {unlockPhase}: {phaseLabel}
                </div>
                {isFuture && (
                  <span
                    style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: '#9BB0C4', background: 'rgba(155,109,255,0.06)', borderRadius: 4,
                      padding: '2px 7px', border: '1px solid rgba(155,109,255,0.2)',
                    }}
                    title="Carriers in this group typically come online at this phase. If you've already been appointed, you'll still see the live status."
                  >
                    Comes online at Phase {unlockPhase}
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                {carriers.map(carrier => {
                  const appt = carrierAppointments.find(c => c.carrier === carrier)
                  const status = appt?.status ?? 'NOT_STARTED'
                  const isInformationalFuture = isFuture && status === 'NOT_STARTED'

                  return (
                    <div key={carrier} style={{
                      padding: '12px 16px', borderRadius: 4,
                      background: status === 'APPOINTED'
                        ? 'rgba(74,222,128,0.05)'
                        : isInformationalFuture ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${status === 'APPOINTED' ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.05)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      opacity: isInformationalFuture ? 0.55 : 1,
                    }}>
                      <div>
                        <div style={{ fontSize: 12, color: '#9BB0C4' }}>{carrier}</div>
                        {appt?.producerNumber && (
                          <div style={{ fontSize: 10, color: '#4B5563', marginTop: 2 }}>#{appt.producerNumber}</div>
                        )}
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                        textTransform: 'uppercase', color: APPT_COLORS[status],
                      }}>
                        {status.replace('_', ' ')}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({ data, onSaved, discordParam, discordReason, discordUsername, isMobile }: { data: AgentData; onSaved: () => void; discordParam: string | null; discordReason: string | null; discordUsername: string | null; isMobile: boolean }) {
  const [form, setForm] = useState({
    phone: data.phone ?? '',
    state: data.state ?? '',
    dateOfBirth: data.dateOfBirth ? data.dateOfBirth.split('T')[0] : '',
    npn: data.npn ?? '',
    licenseNumber: data.licenseNumber ?? '',
    ssn: '',
    addressLine1: data.addressLine1 ?? '',
    addressLine2: data.addressLine2 ?? '',
    city: data.city ?? '',
    zip: data.zip ?? '',
    country: data.country ?? 'US',
    calendlyUrl: (data as AgentData & { calendlyUrl?: string }).calendlyUrl ?? '',
    preferredName: (data as AgentData & { preferredName?: string | null }).preferredName ?? '',
  })
  const [ssnFocused, setSsnFocused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Avatar state
  const [avatarUrl, setAvatarUrl] = useState(data.avatarUrl ?? null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')

  const compressImage = (file: File, maxKb = 2048): Promise<File> => {
    return new Promise((resolve) => {
      if (file.size <= maxKb * 1024) { resolve(file); return }
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        const scale = Math.min(1, Math.sqrt((maxKb * 1024) / file.size))
        width = Math.round(width * scale); height = Math.round(height * scale)
        canvas.width = width; canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        canvas.toBlob(blob => resolve(new File([blob!], file.name, { type: 'image/jpeg' })), 'image/jpeg', 0.85)
      }
      img.src = URL.createObjectURL(file)
    })
  }

  const uploadAvatar = async (file: File) => {
    setAvatarUploading(true)
    setAvatarError('')
    try {
      const compressed = await compressImage(file)
      const fd = new FormData()
      fd.append('avatar', compressed)
      const res = await fetch('/api/agents/avatar', { method: 'POST', body: fd })
      if (!res.ok) {
        const text = await res.text()
        const errMsg = text.startsWith('{') ? (JSON.parse(text) as { error?: string }).error : `Upload failed (${res.status}). Try a smaller image.`
        setAvatarError(errMsg ?? 'Upload failed')
      } else {
        const d = await res.json() as { ok?: boolean; avatarUrl?: string }
        setAvatarUrl(d.avatarUrl ?? null)
        onSaved()
      }
    } catch {
      setAvatarError('Upload failed. Please try again.')
    }
    setAvatarUploading(false)
  }

  // Discord OAuth result is passed in as props (read by parent via useSearchParams)

  const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC',
  ]

  // Format SSN input as XXX-XX-XXXX while typing
  const handleSsnChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 9)
    let formatted = digits
    if (digits.length > 5) formatted = `${digits.slice(0,3)}-${digits.slice(3,5)}-${digits.slice(5)}`
    else if (digits.length > 3) formatted = `${digits.slice(0,3)}-${digits.slice(3)}`
    setForm(f => ({ ...f, ssn: formatted }))
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)

    // Only send SSN if the user actually typed something new
    const payload: Record<string, string> = {
      phone: form.phone,
      state: form.state,
      dateOfBirth: form.dateOfBirth,
      npn: form.npn,
      licenseNumber: form.licenseNumber,
      addressLine1: form.addressLine1,
      addressLine2: form.addressLine2,
      city: form.city,
      zip: form.zip,
      country: form.country,
      // Mercedes (D2161) reported her Calendly link wasn't holding —
      // the input updated form state, but the save payload silently
      // dropped this field, so the PUT body never carried calendlyUrl
      // and the server never wrote it. Include it explicitly.
      calendlyUrl: form.calendlyUrl,
      preferredName: form.preferredName,
    }
    if (form.ssn.replace(/\D/g, '').length > 0) {
      payload.ssn = form.ssn
    }

    const res = await fetch('/api/agents/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const d = await res.json() as { error?: string }
      setError(d.error ?? 'Save failed')
    } else {
      setSaved(true)
      setForm(f => ({ ...f, ssn: '' }))  // clear SSN input after save
      onSaved()
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  return (
    <div style={{ ...card, padding: '24px 28px' }}>
      <div style={sectionLabel}>My Profile</div>
      <p style={{ fontSize: 12, color: '#6B8299', marginBottom: 24, lineHeight: 1.5 }}>
        Update your personal information below. Your email address and agent code are managed by your admin.
      </p>

      {/* Profile Picture */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 14 }}>Profile Photo</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Avatar display */}
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: avatarUrl ? 'transparent' : 'rgba(201,169,110,0.1)',
            border: '2px solid rgba(201,169,110,0.25)',
            overflow: 'hidden', flexShrink: 0, position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 28, color: '#C9A96E', fontWeight: 300 }}>
                {data.firstName.charAt(0)}{data.lastName.charAt(0)}
              </span>
            )}
          </div>
          {/* Upload controls */}
          <div style={{ flex: 1 }}>
            <label style={{
              display: 'inline-block', cursor: avatarUploading ? 'not-allowed' : 'pointer',
              background: 'transparent', border: '1px solid rgba(201,169,110,0.3)',
              color: '#C9A96E', borderRadius: 4, padding: '8px 16px',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              opacity: avatarUploading ? 0.6 : 1, transition: 'background 0.15s',
            }}
              onMouseEnter={e => { if (!avatarUploading) (e.currentTarget.style.background = 'rgba(201,169,110,0.08)') }}
              onMouseLeave={e => { (e.currentTarget.style.background = 'transparent') }}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                disabled={avatarUploading}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) uploadAvatar(file)
                  e.target.value = ''
                }}
              />
              {avatarUploading ? 'Uploading...' : avatarUrl ? 'Change Photo' : 'Upload Photo'}
            </label>
            <p style={{ fontSize: 11, color: '#4B5563', marginTop: 8, lineHeight: 1.5 }}>
              JPG, PNG or WebP · Max 5 MB · Square crop recommended.<br />
              This photo will be used for your Discord profile and team announcements.
            </p>
            {avatarError && (
              <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>{avatarError}</div>
            )}
          </div>
        </div>
      </div>

      {/* Read-only fields */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 20, padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
        <div>
          <div style={{ fontSize: 10, color: '#4B5563', marginBottom: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Email</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: '#6B8299' }}>{data.email}</div>
            <EmailChangeControl currentEmail={data.email} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#4B5563', marginBottom: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Agent Code</div>
          <div style={{ fontSize: 13, color: '#6B8299' }}>{data.agentCode}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#4B5563', marginBottom: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Name</div>
          <div style={{ fontSize: 13, color: '#6B8299' }}>{data.firstName} {data.lastName}</div>
        </div>
        {data.cft && (
          <div>
            <div style={{ fontSize: 10, color: '#4B5563', marginBottom: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Trainer</div>
            <div style={{ fontSize: 13, color: '#6B8299' }}>{data.cft}</div>
          </div>
        )}
      </div>

      {/* Editable form */}
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={fieldLabel}>What I go by (Preferred Name)</label>
          <input
            type="text"
            value={form.preferredName}
            onChange={e => setForm(f => ({ ...f, preferredName: e.target.value }))}
            placeholder={form.preferredName ? '' : `e.g. ${data.firstName === 'Karmvir' ? 'Vick' : 'Chris'}`}
            maxLength={40}
            style={inputStyle}
          />
          <div style={{ fontSize: 11, color: '#6B8299', marginTop: 4, lineHeight: 1.4 }}>
            Shown in place of your first name on Discord posts, the leaderboard, and your welcome email greeting. Leave blank to use your legal first name. Your last name stays legal everywhere.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          <div>
            <label style={fieldLabel}>Phone Number</label>
            <input
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: formatPhoneAsTyped(e.target.value) }))}
              placeholder="e.g. (555) 555-5555"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={fieldLabel}>Licensed State</label>
            <select
              value={form.state}
              onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
              style={{ ...inputStyle, appearance: 'auto' }}
            >
              <option value="">Select state</option>
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={fieldLabel}>Date of Birth <span style={{ color: '#4B5563', fontWeight: 400 }}>(optional)</span></label>
            <DatePicker
              value={form.dateOfBirth}
              onChange={v => setForm(f => ({ ...f, dateOfBirth: v }))}
              max={new Date().toISOString().slice(0, 10)}
              initialView="years"
            />
          </div>
          <div>
            <label style={fieldLabel}>NPN <span style={{ color: '#4B5563', fontWeight: 400 }}>(after licensed)</span></label>
            <input
              value={form.npn}
              onChange={e => setForm(f => ({ ...f, npn: e.target.value }))}
              placeholder="National Producer Number"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={fieldLabel}>License Number <span style={{ color: '#4B5563', fontWeight: 400 }}>(after licensed)</span></label>
            <input
              value={form.licenseNumber}
              onChange={e => setForm(f => ({ ...f, licenseNumber: e.target.value }))}
              placeholder="State license #"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Calendly */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 20, marginTop: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 12 }}>
            Scheduling
          </div>
          <div>
            <label style={fieldLabel}>Calendly Link</label>
            <input
              value={form.calendlyUrl}
              onChange={e => setForm(f => ({ ...f, calendlyUrl: e.target.value }))}
              placeholder="https://calendly.com/your-link"
              style={inputStyle}
            />
            <div style={{ fontSize: 9, color: '#4B5563', marginTop: 4 }}>Your personal scheduling link for clients and prospects</div>
          </div>
        </div>

        {/* Mailing Address */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 20, marginTop: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 12 }}>
            Mailing Address
            <span style={{ marginLeft: 8, fontSize: 9, color: '#4B5563', fontWeight: 400, letterSpacing: '0.06em' }}>used for gifts & correspondence</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={fieldLabel}>Street Address</label>
              <input
                value={form.addressLine1}
                onChange={e => setForm(f => ({ ...f, addressLine1: e.target.value }))}
                placeholder="e.g. 123 Main St"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={fieldLabel}>Apt / Suite / Unit <span style={{ color: '#4B5563', fontWeight: 400 }}>(optional)</span></label>
              <input
                value={form.addressLine2}
                onChange={e => setForm(f => ({ ...f, addressLine2: e.target.value }))}
                placeholder="e.g. Apt 4B (skip if not applicable)"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
              <div>
                <label style={fieldLabel}>City</label>
                <input
                  value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  placeholder="e.g. Chicago"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={fieldLabel}>State</label>
                <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} style={inputStyle}>
                  <option value="">Select</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={fieldLabel}>ZIP</label>
                <input
                  value={form.zip}
                  onChange={e => setForm(f => ({ ...f, zip: e.target.value }))}
                  placeholder="e.g. 60601"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        </div>

        {/* SSN section — full width with privacy notice */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 20, marginTop: 4 }}>
          <label style={fieldLabel}>
            Social Security Number
            {data.ssnOnFile && !ssnFocused && form.ssn === '' && (
              <span style={{ color: '#4ade80', fontWeight: 400, marginLeft: 8 }}>✓ On file</span>
            )}
          </label>

          {/* Privacy notice */}
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            background: 'rgba(201,169,110,0.05)',
            border: '1px solid rgba(201,169,110,0.15)',
            borderRadius: 6, padding: '10px 14px', marginBottom: 10,
          }}>
            <span style={{ color: '#C9A96E', fontSize: 14, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>⚑</span>
            <p style={{ margin: 0, fontSize: 11, color: '#9BB0C4', lineHeight: 1.6 }}>
              Your SSN is collected solely for employment verification, carrier appointment processing, and E&O insurance purposes as required by All Financial Freedom.
              It is encrypted and stored securely. Only authorized AFF staff can access it, and it is never shared with third parties outside of these licensing requirements.
            </p>
          </div>

          <div style={{ position: 'relative' }}>
            <input
              type={ssnFocused || form.ssn ? 'text' : 'password'}
              value={ssnFocused || form.ssn ? form.ssn : (data.ssnMasked ?? '')}
              onChange={e => handleSsnChange(e.target.value)}
              onFocus={() => setSsnFocused(true)}
              onBlur={() => { if (!form.ssn) setSsnFocused(false) }}
              placeholder={data.ssnOnFile ? 'Enter new SSN to update' : 'XXX-XX-XXXX'}
              autoComplete="off"
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' as const }}
            />
            {data.ssnOnFile && !ssnFocused && form.ssn === '' && (
              <div style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                fontSize: 10, color: '#4B5563', letterSpacing: '0.05em',
              }}>MASKED</div>
            )}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 10, color: '#4B5563', lineHeight: 1.5 }}>
            After saving, your SSN will be masked. Only the last 4 digits will be visible to you.
          </p>
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 4 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              background: saving ? 'rgba(201,169,110,0.3)' : '#C9A96E',
              color: '#142D48', border: 'none', borderRadius: 4,
              padding: '9px 20px', fontSize: 11, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              letterSpacing: '0.12em', textTransform: 'uppercase',
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {saved && <span style={{ fontSize: 12, color: '#4ade80' }}>✓ Saved</span>}
        </div>
      </form>

      {/* ── Discord section ─────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 28, paddingTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#5865F2">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.02.012.04.032.052a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          <div style={sectionLabel}>Discord</div>
          {data.discordUserId && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: '#4ade80', background: 'rgba(74,222,128,0.1)', borderRadius: 4,
              padding: '2px 7px', border: '1px solid rgba(74,222,128,0.2)',
            }}>Connected</span>
          )}
        </div>
        <p style={{ fontSize: 12, color: '#6B8299', marginBottom: 16, lineHeight: 1.6 }}>
          Link your Discord account so the AFF bot automatically assigns your phase role in the server.
          {' '}
          <strong style={{ color: '#9BB0C4' }}>Install the Discord app on your phone</strong> (
          <a href="https://apps.apple.com/app/discord/id985746746" target="_blank" rel="noopener noreferrer" style={{ color: '#C9A96E', textDecoration: 'underline' }}>iOS</a>
          {' '}or{' '}
          <a href="https://play.google.com/store/apps/details?id=com.discord" target="_blank" rel="noopener noreferrer" style={{ color: '#C9A96E', textDecoration: 'underline' }}>Android</a>
          ) so you actually get pings for renewal reminders, training nudges, and shoutouts. Without the mobile app turned on for notifications, the team&apos;s messages just sit in the channel.
        </p>

        {/* OAuth result banner */}
        {discordParam === 'connected' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 16, padding: '10px 14px', borderRadius: 6,
            background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
          }}>
            <span style={{ color: '#4ade80', fontSize: 16 }}>✓</span>
            <div>
              <div style={{ fontSize: 13, color: '#4ade80', fontWeight: 600 }}>
                Discord connected{discordUsername ? ` as ${discordUsername}` : ''}!
              </div>
              <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
                Your phase role has been assigned in the AFF server.
              </div>
            </div>
          </div>
        )}
        {discordParam === 'error' && (
          <div style={{
            marginBottom: 16, padding: '12px 16px', borderRadius: 6, fontSize: 12,
            color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
            lineHeight: 1.6,
          }}>
            {discordReason === 'unverified' || discordReason === 'cancelled' ? (
              <>
                <div style={{ fontWeight: 700, marginBottom: 6, color: '#fca5a5' }}>
                  Discord wouldn&apos;t let you authorize.
                </div>
                <div style={{ color: '#d4d4d4', marginBottom: 8 }}>
                  Most often this means your Discord account doesn&apos;t have a verified email or phone number on file. Discord requires one before it&apos;ll let you join a new server through OAuth.
                </div>
                <div style={{ color: '#d4d4d4' }}>
                  <strong style={{ color: '#fff' }}>How to fix it:</strong> open Discord &rarr; User Settings &rarr; My Account, and click <strong style={{ color: '#fff' }}>Verify</strong> next to your email (Discord sends a confirmation link). Or add and verify a phone number. Then come back and click Connect Discord again.
                </div>
              </>
            ) : (
              <>Something went wrong connecting Discord. Please try again, and if it keeps failing, message your trainer.</>
            )}
          </div>
        )}

        {/* Connect / Reconnect button */}
        <a
          href="/api/agents/discord-connect"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: '#5865F2', color: '#ffffff',
            borderRadius: 4, padding: '10px 20px',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            textDecoration: 'none', transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.02.012.04.032.052a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          {data.discordUserId ? 'Reconnect Discord' : 'Connect Discord'}
        </a>
        {!data.discordUserId && (
          <div style={{ marginTop: 12 }}>
            <DiscordVerifyHint />
          </div>
        )}

        {/* Current role + username */}
        {(data.discordRoleName || data.discordUserId) && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {data.discordRoleName && (
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                color: '#5865F2', background: 'rgba(88,101,242,0.12)',
                borderRadius: 4, padding: '3px 9px', border: '1px solid rgba(88,101,242,0.2)',
              }}>
                {data.discordRoleName}
              </span>
            )}
            {data.discordUserId && (
              <span style={{ fontSize: 10, color: '#4B5563', fontFamily: 'monospace' }}>
                ID: {data.discordUserId}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Client touchpoint reminders. Self-fetches its own state so
          the Profile tab payload doesn't grow. Mercedes-feedback
          driven: agents toggle birthday / 30-day thank-you / annual
          review reminders for their book of clients. Daily cron
          fires the due ones as Discord DMs + bell pings. */}
      <div style={{ marginTop: 18 }}>
        <ClientReminderTogglesCard />
      </div>
    </div>
  )
}

// ─── Business Partners Tab ─────────────────────────────────────────────────────

interface Partner {
  id: string; name: string; email: string | null; phone: string | null
  timeZone: string | null; age: string | null; married: boolean; children: boolean
  homeowner: boolean; occupation: string | null; characterTraits: string | null
  category: string | null; appointmentDate: string | null; icaDate: string | null
  firstCallDate: string | null; secondCallDate: string | null; bookedAppt: boolean
  notes: string | null; phaseItemKey: string | null
  introSentAt: string | null
  source: string | null
  // Workflow lifecycle.
  //   PENDING    = in the import queue, agent hasn't classified yet
  //   NEW        = classified, no outreach yet
  //   CONTACTED  = agent reached out (manual flag for FTA flow)
  //   INTRO_SENT = CEO intro sent (BP flow)
  //   BOOKED     = appointment on the calendar
  //   CONVERTED  = joined the team / became a client
  //   SKIPPED    = decided not to pursue, hidden from queue but kept
  status: string
  lastContactAt: string | null
  createdAt?: string
  // Surfaced when a contact's email matches an AgentUser, i.e. the
  // recruit got onboarded. Lets the writing agent grab their NPN /
  // license from the BP card for app submissions instead of texting
  // them every time.
  linkedAgentProfile: {
    id: string
    agentCode: string
    npn: string | null
    licenseNumber: string | null
  } | null
}

// Lanes within the contact pipeline. Two visible buckets, plus the queue
// (pre-classification) and a skipped archive for revisit. Life-Market /
// Rollover-Market live in the legacy categories but aren't part of the
// recruit-flow tabs.
type ContactView = 'queue' | 'business_partners' | 'fta' | 'skipped'

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'In Queue',
  NEW: 'New',
  CONTACTED: 'Contacted',
  INTRO_SENT: 'Intro Sent',
  BOOKED: 'Booked',
  CONVERTED: 'Converted',
  SKIPPED: 'Skipped',
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#9BB0C4',
  NEW: '#60a5fa',
  CONTACTED: '#C9A96E',
  INTRO_SENT: '#9B6DFF',
  BOOKED: '#f59e0b',
  CONVERTED: '#4ade80',
  SKIPPED: '#4B5563',
}

interface ImportPreviewRow {
  name: string
  email: string | null
  phone: string | null
  occupation: string | null
  notes: string | null
  suggestedCategory: string | null
  // UI-side: the agent's chosen category (defaults to suggested)
  category: string
  // UI-side: agent can deselect rows they don't want to import
  selected: boolean
}

interface Referral {
  id: string; firstName: string; lastName: string; email: string
  phone: string | null; state: string | null; notes: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string
}

const REFERRAL_STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b', APPROVED: '#4ade80', REJECTED: '#f87171',
}

// Three-bucket model. The Partners tab was getting noisy with five
// overlapping categories; agents kept asking "what's the difference
// between business_partner and recruit?" Now it's just two intents
// (recruit them OR train them) plus a generic "business partner"
// catch-all. Keeps the dropdown short and the lanes obvious.
const PARTNER_CATEGORIES = [
  { key: 'recruit', label: 'Recruit' },
  { key: 'business_partner', label: 'Business Partner' },
  { key: 'fta_contact', label: 'FTA Contact' },
] as const

const TIMEZONES = ['EST', 'CST', 'MST', 'PST', 'HST', 'AKST'] as const

// Self-serve email change with verification. Renders an inline
// "Change" button next to the agent's current email. Clicking opens a
// new-email input + Send link; the server emails BOTH the new address
// (verify) and the old address (cancel). Email isn't actually swapped
// until the agent clicks the link in their new mailbox.
function EmailChangeControl({ currentEmail }: { currentEmail: string }) {
  const [open, setOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    const trimmed = newEmail.trim().toLowerCase()
    if (!trimmed || trimmed === currentEmail.toLowerCase()) return
    setSending(true)
    try {
      const res = await fetch('/api/agents/profile/email-change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail: trimmed }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; pendingEmail?: string; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Failed to start email change. Try again.')
      } else {
        setPendingEmail(data.pendingEmail ?? trimmed)
        setNewEmail('')
      }
    } finally {
      setSending(false)
    }
  }

  if (pendingEmail) {
    return (
      <div style={{
        flex: '1 1 100%',
        marginTop: 6, padding: '10px 12px',
        background: 'rgba(245,158,11,0.06)',
        border: '1px solid rgba(245,158,11,0.25)',
        borderRadius: 4,
      }}>
        <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 700, marginBottom: 4 }}>
          Verification sent
        </div>
        <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.5 }}>
          We sent a confirmation link to <strong style={{ color: '#fff' }}>{pendingEmail}</strong>. Click it to finish the change.
          Until then, keep using <strong style={{ color: '#fff' }}>{currentEmail}</strong>.
        </div>
        <div style={{ fontSize: 10, color: '#6B8299', marginTop: 6 }}>
          We also sent your current address a security alert with a Cancel link in case this wasn&apos;t you.
        </div>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: 'transparent', border: '1px solid rgba(201,169,110,0.3)',
          color: '#C9A96E', borderRadius: 4,
          padding: '4px 10px', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        Change
      </button>
    )
  }

  return (
    <div style={{ flex: '1 1 100%', marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="email"
          autoFocus
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          placeholder="new@example.com"
          style={{
            flex: '1 1 220px', minWidth: 0, boxSizing: 'border-box',
            background: '#0A1628', border: '1px solid rgba(201,169,110,0.25)',
            borderRadius: 4, color: '#d1d9e2',
            padding: '7px 10px', fontSize: 12, fontFamily: 'inherit',
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={sending || !newEmail.trim()}
          style={{
            background: '#C9A96E', color: '#142D48',
            border: 'none', borderRadius: 4,
            padding: '7px 14px', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: sending || !newEmail.trim() ? 'not-allowed' : 'pointer',
            opacity: sending || !newEmail.trim() ? 0.6 : 1,
          }}
        >
          {sending ? 'Sending...' : 'Send link'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setNewEmail(''); setError(null) }}
          style={{
            background: 'transparent', color: '#9BB0C4',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
            padding: '7px 10px', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
      <div style={{ fontSize: 10, color: '#6B8299', marginTop: 6, lineHeight: 1.5 }}>
        We&apos;ll email a verification link to the new address. Until you click it, your current email stays in effect.
      </div>
      {error && <div style={{ fontSize: 11, color: '#F87171', marginTop: 6 }}>{error}</div>}
    </div>
  )
}

function BusinessPartnersTab({ isMobile, previewToken }: { isMobile: boolean; previewToken?: string | null }) {
  // Append ?preview=<token> to any agent endpoint when an admin / LC is
  // viewing-as-agent. Without it, the API can't tell which agent's data
  // to read or attribute writes to, and returns Unauthorized.
  const withPreview = (path: string) => previewToken
    ? `${path}${path.includes('?') ? '&' : '?'}preview=${previewToken}`
    : path

  // ── View / filter / search state ────────────────────────────────────
  const [view, setView] = useState<ContactView>('queue')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'imported' | 'lastContact'>('imported')
  // "Stale" = no contact action in 12+ months. Helps mass-prune the list.
  const [showStaleOnly, setShowStaleOnly] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [partners, setPartners] = useState<Partner[]>([])
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Per-row read-only "full contact card" expander. Lets agents see the
  // notes / character traits (MACHO read, past-interaction context) right
  // in the list without opening the edit form.
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const emptyForm = { name: '', email: '', phone: '', timeZone: '', age: '', married: false, children: false, homeowner: false, occupation: '', characterTraits: '', category: '', appointmentDate: '', firstCallDate: '', secondCallDate: '', bookedAppt: false, notes: '' }
  const [form, setForm] = useState(emptyForm)
  // Counter for the "saved · N added" confirmation chip on the rapid-entry
  // form. Auto-decrements after 4s so the chip fades unless they keep
  // adding.
  const [recentlyAddedCount, setRecentlyAddedCount] = useState(0)
  const [showReferForm, setShowReferForm] = useState(false)
  const [referForm, setReferForm] = useState({ firstName: '', lastName: '', email: '', phone: '', state: '', notes: '' })
  // "Claim existing agent" picker. Opens the same RecruitClaimModal
  // used on the Phase 2 checklist, but in team-only mode (itemKey=null)
  // — picking an agent just sets recruiterId, no phase item is touched.
  // Surfaces the recruit-claim feature where phase-5+ EMDs actually
  // look (the Refer section), since they're past the direct_1/2/3
  // checklist slots.
  const [teamClaimOpen, setTeamClaimOpen] = useState(false)
  const [claimToast, setClaimToast] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [referError, setReferError] = useState<string | null>(null)
  // Import flow: open modal → upload CSV → preview state → classify each row → commit.
  const [importOpen, setImportOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[] | null>(null)
  const [importBulkCategory, setImportBulkCategory] = useState<string>('')
  const [importError, setImportError] = useState<string | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  // CEO intro flow
  const [introModalPartner, setIntroModalPartner] = useState<Partner | null>(null)
  const [introNote, setIntroNote] = useState('')
  const [introSending, setIntroSending] = useState(false)
  const [introError, setIntroError] = useState<string | null>(null)
  // Schedule-FTA flow: opens a small date picker on an FTA contact and
  // creates a FieldTrainingAppointment + flips the contact to BOOKED so
  // it disappears from the FTA Contacts lane and shows up in the FTA tab.
  const [scheduleFtaPartner, setScheduleFtaPartner] = useState<Partner | null>(null)
  const [scheduleFtaDate, setScheduleFtaDate] = useState('')
  const [scheduleFtaSaving, setScheduleFtaSaving] = useState(false)
  const [scheduleFtaError, setScheduleFtaError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(withPreview('/api/agents/partners')).then(r => r.json()),
      fetch(withPreview('/api/agents/referrals')).then(r => r.json()),
    ]).then(([pd, rd]: [{ partners: Partner[] }, { referrals: Referral[] }]) => {
      setPartners(pd.partners ?? [])
      setReferrals(rd.referrals ?? [])
      setLoading(false)
    })
  }, [])

  const resetForm = () => { setForm(emptyForm); setEditingId(null); setShowForm(false) }

  const startEdit = (p: Partner) => {
    setForm({
      name: p.name, email: p.email ?? '', phone: p.phone ?? '',
      timeZone: p.timeZone ?? '', age: p.age ?? '',
      married: p.married, children: p.children, homeowner: p.homeowner,
      occupation: p.occupation ?? '', characterTraits: p.characterTraits ?? '',
      category: p.category ?? '', notes: p.notes ?? '',
      appointmentDate: p.appointmentDate ? p.appointmentDate.slice(0, 10) : '',
      firstCallDate: p.firstCallDate ? p.firstCallDate.slice(0, 10) : '',
      secondCallDate: p.secondCallDate ? p.secondCallDate.slice(0, 10) : '',
      bookedAppt: p.bookedAppt,
    })
    setEditingId(p.id)
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      // Auto-assign category and status based on which tab the user is on
      const autoCategory = form.category || activeCategory || (
        view === 'business_partners' ? 'business_partner'
        : view === 'fta' ? 'fta_contact'
        : undefined
      )
      const autoStatus = view === 'queue' ? 'PENDING' : 'NEW'
      const payload = { ...form, category: autoCategory, status: autoStatus }
      if (editingId) {
        const res = await fetch('/api/agents/partners', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...payload }) })
        const updated = await res.json() as Partner
        setPartners(prev => prev.map(p => p.id === editingId ? updated : p))
        // Edits close the form — that's the standard "I'm done with this row" flow.
        resetForm()
      } else {
        const res = await fetch('/api/agents/partners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const p = await res.json() as Partner
        setPartners(prev => [...prev, p])
        // Rapid-entry: clear the fields but KEEP the form open so adding 5
        // contacts in a row doesn't require 5 trips through the +Add toggle.
        // Multiple agents reported the form "only lets me add one" because
        // the form was collapsing after each save. Confirm the save with a
        // brief inline pulse so they know it landed.
        setForm(emptyForm)
        setEditingId(null)
        setRecentlyAddedCount(c => c + 1)
        setTimeout(() => setRecentlyAddedCount(c => Math.max(0, c - 1)), 4000)
      }
    } finally { setSaving(false) }
  }

  const handleRefer = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setReferError(null)
    try {
      const res = await fetch(withPreview('/api/agents/referrals'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(referForm) })
      if (!res.ok) { const d = await res.json() as { error?: string }; setReferError(d.error ?? 'Failed to submit'); return }
      const r = await res.json() as Referral
      setReferrals(prev => [r, ...prev])
      setReferForm({ firstName: '', lastName: '', email: '', phone: '', state: '', notes: '' })
      setShowReferForm(false)
    } finally { setSaving(false) }
  }

  const handleImportFile = async (file: File) => {
    setImportError(null)
    setImportBusy(true)
    try {
      const csv = await file.text()
      const res = await fetch('/api/agents/partners/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'preview', csv }),
      })
      const data = await res.json() as { rows?: Omit<ImportPreviewRow, 'category' | 'selected'>[]; error?: string }
      if (!res.ok || !data.rows) { setImportError(data.error ?? 'Could not read CSV'); return }
      if (data.rows.length === 0) { setImportError('No usable contacts found in this CSV'); return }
      setImportPreview(data.rows.map(r => ({
        ...r,
        category: r.suggestedCategory ?? '',
        selected: true,
      })))
    } catch {
      setImportError('Failed to read file')
    } finally { setImportBusy(false) }
  }

  const handleImportCommit = async () => {
    if (!importPreview) return
    const toSend = importPreview.filter(r => r.selected && r.name.trim())
    if (toSend.length === 0) { setImportError('Pick at least one row to import'); return }
    setImportBusy(true)
    setImportError(null)
    try {
      const res = await fetch('/api/agents/partners/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'commit',
          rows: toSend.map(r => ({
            name: r.name, email: r.email, phone: r.phone,
            occupation: r.occupation, notes: r.notes,
            category: r.category || null,
          })),
        }),
      })
      const data = await res.json() as { partners?: Partner[]; error?: string }
      if (!res.ok || !data.partners) { setImportError(data.error ?? 'Import failed'); return }
      setPartners(prev => [...data.partners!, ...prev])
      setImportPreview(null)
      setImportOpen(false)
    } finally { setImportBusy(false) }
  }

  const handleSendIntro = async () => {
    if (!introModalPartner) return
    setIntroSending(true)
    setIntroError(null)
    try {
      const res = await fetch(`/api/agents/partners/${introModalPartner.id}/send-intro`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalNote: introNote.trim() || undefined }),
      })
      const data = await res.json() as { partner?: Partner; error?: string }
      if (!res.ok || !data.partner) { setIntroError(data.error ?? 'Failed to send'); return }
      setPartners(prev => prev.map(p => p.id === data.partner!.id ? data.partner! : p))
      setIntroModalPartner(null)
      setIntroNote('')
    } finally { setIntroSending(false) }
  }

  // ── View routing: split contacts into Queue / BP Prospects / FTA / Skipped ──
  // The Queue is the import dump that hasn't been classified yet. Each
  // lane shows its own pipeline stages. Skipped is an archive (kept so
  // re-imports don't re-queue the same person).
  const inQueue       = partners.filter(p => p.status === 'PENDING')
  const businessLane  = partners.filter(p => p.status !== 'PENDING' && p.status !== 'SKIPPED'
                                             && (p.category === 'business_partner' || p.category === 'recruit'))
  // Show all FTA contacts including BOOKED ones so they don't vanish.
  // BOOKED contacts display with a badge indicating they have a
  // scheduled appointment in the FTA Tracker tab.
  const ftaLane       = partners.filter(p => p.status !== 'PENDING' && p.status !== 'SKIPPED'
                                             && p.category === 'fta_contact')
  const skippedLane   = partners.filter(p => p.status === 'SKIPPED')
  const queueCount = inQueue.length

  const baseList = view === 'queue'             ? inQueue
                  : view === 'business_partners' ? businessLane
                  : view === 'fta'               ? ftaLane
                                                 : skippedLane

  // Search across name / email / phone / occupation. Cheap on a 500-row
  // list — no need for a debounced fetch.
  const searchLower = search.trim().toLowerCase()
  const searched = searchLower
    ? baseList.filter(p => [p.name, p.email, p.phone, p.occupation].some(
        f => f && f.toLowerCase().includes(searchLower)
      ))
    : baseList

  // Stale = no lastContactAt for 365+ days, OR (no lastContactAt at all
  // AND created over 365 days ago). Useful for cleaning up old contacts
  // the agent hasn't actually engaged with in years.
  const staleThreshold = Date.now() - 365 * 86_400_000
  const filtered = showStaleOnly
    ? searched.filter(p => {
        const ref = p.lastContactAt ?? p.createdAt ?? null
        return ref ? new Date(ref).getTime() < staleThreshold : true
      })
    : searched

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    if (sortBy === 'lastContact') {
      const at = a.lastContactAt ? new Date(a.lastContactAt).getTime() : 0
      const bt = b.lastContactAt ? new Date(b.lastContactAt).getTime() : 0
      return bt - at
    }
    // 'imported' (default): newest first by createdAt, falling back to id ordering
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return bt - at
  })

  // Drop selections that are no longer visible in the current view so
  // bulk actions only touch what the user can actually see.
  const visibleIds = new Set(sorted.map(p => p.id))
  const effectiveSelection = new Set([...selectedIds].filter(id => visibleIds.has(id)))
  const allSelected = sorted.length > 0 && sorted.every(p => effectiveSelection.has(p.id))

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const selectAll = (checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) sorted.forEach(p => next.add(p.id))
      else sorted.forEach(p => next.delete(p.id))
      return next
    })
  }
  const clearSelection = () => setSelectedIds(new Set())

  // ── Single-row actions ──────────────────────────────────────────────
  const classifyOne = async (id: string, category: string) => {
    // Optimistic: flip status + category locally so the row leaves the
    // queue immediately. Keeps the UI feeling instant on a 500-contact
    // list. If the call fails, revert.
    const prev = partners
    setPartners(ps => ps.map(p => p.id === id ? { ...p, category, status: 'NEW' } : p))
    const res = await fetch(withPreview(`/api/agents/partners/${id}/classify`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'classify', category }),
    })
    if (!res.ok) { setPartners(prev); return }
    if (category === 'business_partner') {
      import('canvas-confetti').then(({ default: confetti }) => {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#C9A96E', '#4ade80', '#60a5fa', '#ffffff'] })
      })
    }
  }

  const skipOne = async (id: string) => {
    const prev = partners
    setPartners(ps => ps.map(p => p.id === id ? { ...p, status: 'SKIPPED' } : p))
    const res = await fetch(withPreview(`/api/agents/partners/${id}/classify`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skip' }),
    })
    if (!res.ok) setPartners(prev)
  }

  const advanceOne = async (id: string, status: string) => {
    const prev = partners
    setPartners(ps => ps.map(p => p.id === id ? { ...p, status, lastContactAt: new Date().toISOString() } : p))
    const res = await fetch(withPreview(`/api/agents/partners/${id}/classify`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', status }),
    })
    if (!res.ok) setPartners(prev)
  }

  // Two writes: create the FieldTrainingAppointment record, then advance
  // the contact's status to BOOKED. The FTA lane filter excludes BOOKED
  // so the row visually moves from Partners > FTA Contacts into the FTA
  // tab, which is what the agent expects after scheduling.
  const scheduleFta = async () => {
    if (!scheduleFtaPartner) return
    if (!scheduleFtaDate) { setScheduleFtaError('Pick a date'); return }
    setScheduleFtaSaving(true)
    setScheduleFtaError(null)
    try {
      const ftaRes = await fetch('/api/agents/fta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: scheduleFtaPartner.name,
          phone: scheduleFtaPartner.phone,
          appointmentDate: scheduleFtaDate,
          notes: scheduleFtaPartner.notes,
        }),
      })
      if (!ftaRes.ok) {
        const d = await ftaRes.json().catch(() => ({})) as { error?: string }
        setScheduleFtaError(d.error ?? 'Failed to create FTA')
        return
      }
      // FTA created; flip the partner to BOOKED so it leaves the lane.
      await advanceOne(scheduleFtaPartner.id, 'BOOKED')
      setScheduleFtaPartner(null)
      setScheduleFtaDate('')
    } finally { setScheduleFtaSaving(false) }
  }

  const deleteOne = async (id: string) => {
    if (!confirm('Delete this contact permanently?')) return
    const prev = partners
    setPartners(ps => ps.filter(p => p.id !== id))
    const res = await fetch(withPreview('/api/agents/partners'), {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) setPartners(prev)
  }

  // ── Bulk actions over selected rows ─────────────────────────────────
  const bulkClassify = async (category: string) => {
    const ids = [...effectiveSelection]
    if (ids.length === 0) return
    const prev = partners
    setPartners(ps => ps.map(p => ids.includes(p.id) ? { ...p, category, status: 'NEW' } : p))
    clearSelection()
    const res = await fetch(withPreview('/api/agents/partners/bulk'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action: 'classify', category }),
    })
    if (!res.ok) setPartners(prev)
  }
  const bulkSkip = async () => {
    const ids = [...effectiveSelection]
    if (ids.length === 0) return
    const prev = partners
    setPartners(ps => ps.map(p => ids.includes(p.id) ? { ...p, status: 'SKIPPED' } : p))
    clearSelection()
    const res = await fetch(withPreview('/api/agents/partners/bulk'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action: 'skip' }),
    })
    if (!res.ok) setPartners(prev)
  }
  const bulkDelete = async () => {
    const ids = [...effectiveSelection]
    if (ids.length === 0) return
    if (!confirm(`Delete ${ids.length} contact${ids.length === 1 ? '' : 's'} permanently? This can't be undone.`)) return
    const prev = partners
    setPartners(ps => ps.filter(p => !ids.includes(p.id)))
    clearSelection()
    try {
      const res = await fetch(withPreview('/api/agents/partners/bulk'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'delete' }),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.error('[bulkDelete] failed:', res.status, errText)
        alert(`Delete failed (${res.status}). Please try again.`)
        setPartners(prev)
      }
    } catch (err) {
      console.error('[bulkDelete] network error:', err)
      alert('Delete failed. Please check your connection.')
      setPartners(prev)
    }
  }

  const thStyle: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C9A96E', whiteSpace: 'nowrap' }
  const tdStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 11, color: '#9BB0C4' }
  const checkStyle: React.CSSProperties = { ...tdStyle, textAlign: 'center', fontSize: 13 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Build My Team — covers both refer-new and claim-existing in one section */}
      <div style={{ ...card, padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showReferForm || referrals.length > 0 ? 14 : 0, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={sectionLabel}>Build My Team</div>
            <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
              Refer someone new to join your team, or claim an existing AFF agent you recruited.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            <button
              onClick={() => setTeamClaimOpen(true)}
              style={{ background: 'transparent', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.4)', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              title="Already recruited an agent who's in AFF? Claim them as part of your team."
            >
              Claim existing
            </button>
            <button onClick={() => setShowReferForm(!showReferForm)} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Refer</button>
          </div>
        </div>
        {claimToast && (
          <div style={{
            margin: '0 0 10px', padding: '8px 12px',
            background: 'rgba(74,222,128,0.08)',
            border: '1px solid rgba(74,222,128,0.3)',
            borderRadius: 4,
            fontSize: 12, color: '#4ADE80',
          }}>
            {claimToast}
          </div>
        )}
        {teamClaimOpen && (
          <RecruitClaimModal
            itemKey={null}
            itemLabel="Add to your team"
            previewToken={previewToken}
            alreadyClaimedProfileIds={[]}
            onClose={() => setTeamClaimOpen(false)}
            onReferNew={() => { setShowReferForm(true) }}
            onClaimed={result => {
              setClaimToast(
                result.conflict
                  ? `${result.recruit.firstName} ${result.recruit.lastName} added — note: another recruiter (${result.conflict.existingRecruiterCode}) was already on file. An admin will reconcile.`
                  : `${result.recruit.firstName} ${result.recruit.lastName} is now linked to your team.`
              )
              setTeamClaimOpen(false)
              setTimeout(() => setClaimToast(null), 6000)
            }}
          />
        )}
        {showReferForm && (
          <form onSubmit={handleRefer} style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, padding: 16, background: 'rgba(201,169,110,0.03)', borderRadius: 6, border: '1px solid rgba(201,169,110,0.12)' }}>
            <div><label style={fieldLabel}>First Name *</label><input required style={inputStyle} value={referForm.firstName} onChange={e => setReferForm(f => ({ ...f, firstName: e.target.value }))} /></div>
            <div><label style={fieldLabel}>Last Name *</label><input required style={inputStyle} value={referForm.lastName} onChange={e => setReferForm(f => ({ ...f, lastName: e.target.value }))} /></div>
            <div><label style={fieldLabel}>Email *</label><input required type="email" style={inputStyle} value={referForm.email} onChange={e => setReferForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><label style={fieldLabel}>Phone</label><input type="tel" inputMode="numeric" placeholder="e.g. (555) 123-4567" style={inputStyle} value={referForm.phone} onChange={e => setReferForm(f => ({ ...f, phone: formatPhoneAsTyped(e.target.value) }))} /></div>
            <div><label style={fieldLabel}>State</label>
              <select style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' }} value={referForm.state} onChange={e => setReferForm(f => ({ ...f, state: e.target.value }))}>
                <option value="">Select a state</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label style={fieldLabel}>Notes</label><input style={inputStyle} value={referForm.notes} onChange={e => setReferForm(f => ({ ...f, notes: e.target.value }))} /></div>
            {referError && <div style={{ gridColumn: isMobile ? undefined : 'span 2', fontSize: 11, color: '#f87171' }}>{referError}</div>}
            <div style={{ gridColumn: isMobile ? undefined : 'span 2', display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Submitting...' : 'Submit for Approval'}</button>
              <button type="button" onClick={() => setShowReferForm(false)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6B8299', borderRadius: 4, padding: '6px 14px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        )}
        {referrals.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {['Name', 'Email', 'State', 'Status', 'Submitted'].map(h => <th key={h} style={thStyle}>{h}</th>)}
            </tr></thead>
            <tbody>{referrals.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <td style={{ ...tdStyle, color: '#ffffff' }}>{r.firstName} {r.lastName}</td>
                <td style={tdStyle}>{r.email}</td>
                <td style={tdStyle}>{r.state ?? '—'}</td>
                <td style={tdStyle}><span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: REFERRAL_STATUS_COLORS[r.status] ?? '#6B8299' }}>{r.status}</span></td>
                <td style={{ ...tdStyle, color: '#4B5563' }}>{new Date(r.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {/* Contacts pipeline: Queue → Business Partners / FTA / Skipped */}
      <div style={{ ...card, padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={sectionLabel}>Contacts</div>
            <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2, lineHeight: 1.5 }}>
              Import contacts from your phone, classify each as a Business Partner prospect or FTA contact, and reach out from there.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {queueCount > 0 && (
              <button
                onClick={() => setView('queue')}
                style={{
                  background: 'rgba(245,158,11,0.12)',
                  border: '1px solid rgba(245,158,11,0.4)',
                  color: '#F59E0B',
                  borderRadius: 4, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                title="Click to jump to the queue"
              >
                <span style={{ background: '#F59E0B', color: '#0A1628', borderRadius: 999, padding: '1px 7px', fontSize: 10 }}>{queueCount}</span>
                in queue
              </button>
            )}
            <button onClick={() => { setImportOpen(true); setImportPreview(null); setImportError(null) }} style={{ background: 'transparent', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.4)', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>&uarr; Import CSV</button>
            <button onClick={() => { resetForm(); setRecentlyAddedCount(0); setShowForm(!showForm) }} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
          </div>
        </div>

        {/* View tabs: Queue / Business Partners / FTA / Skipped */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
          {([
            { key: 'queue',              label: 'Queue',              count: inQueue.length,      color: '#F59E0B' },
            { key: 'business_partners',  label: 'Business Partners',  count: businessLane.length, color: '#9B6DFF' },
            { key: 'fta',                label: 'FTA Contacts',       count: ftaLane.length,      color: '#60a5fa' },
            { key: 'skipped',            label: 'Skipped',            count: skippedLane.length,  color: '#6B8299' },
          ] as Array<{ key: ContactView; label: string; count: number; color: string }>).map(t => {
            const active = view === t.key
            return (
              <button key={t.key} onClick={() => { setView(t.key); clearSelection() }} style={{
                padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                background: 'none', border: 'none',
                color: active ? t.color : '#6B8299',
                borderBottom: active ? `2px solid ${t.color}` : '2px solid transparent',
                marginBottom: -1, cursor: 'pointer',
              }}>
                {t.label} <span style={{ fontWeight: 400, opacity: 0.7 }}>({t.count})</span>
              </button>
            )
          })}
        </div>

        {/* Search + sort + stale filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, phone, occupation..."
            style={{ ...inputStyle, flex: 1, minWidth: 200, padding: '7px 12px' }}
          />
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
            <option value="imported">Newest first</option>
            <option value="name">Name (A-Z)</option>
            <option value="lastContact">Last contacted</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: showStaleOnly ? '#F59E0B' : '#6B8299', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={showStaleOnly} onChange={e => setShowStaleOnly(e.target.checked)} />
            Stale (12+ months)
          </label>
        </div>

        {/* Bulk action bar — shows when any rows in this view are selected */}
        {effectiveSelection.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '10px 14px', marginBottom: 12,
            background: 'rgba(201,169,110,0.08)',
            border: '1px solid rgba(201,169,110,0.25)',
            borderRadius: 6,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#C9A96E' }}>
              {effectiveSelection.size} selected
            </span>
            {view === 'queue' && (
              <>
                <button onClick={() => bulkClassify('business_partner')} style={{ background: 'rgba(155,109,255,0.15)', border: '1px solid rgba(155,109,255,0.4)', color: '#9B6DFF', fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 3, cursor: 'pointer' }}>&rarr; Business Partner</button>
                <button onClick={() => bulkClassify('fta_contact')} style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.4)', color: '#60A5FA', fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 3, cursor: 'pointer' }}>&rarr; FTA Contact</button>
                <button onClick={() => bulkSkip()} style={{ background: 'transparent', border: '1px solid rgba(107,130,153,0.4)', color: '#9BB0C4', fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 3, cursor: 'pointer' }}>Skip</button>
              </>
            )}
            <button onClick={() => bulkDelete()} style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.35)', color: '#f87171', fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 3, cursor: 'pointer' }}>Delete</button>
            <button onClick={clearSelection} style={{ background: 'none', border: 'none', color: '#6B8299', fontSize: 10, cursor: 'pointer', marginLeft: 'auto' }}>Clear</button>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)' }}>
            <div><label style={fieldLabel}>Name *</label><input required style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label style={fieldLabel}>Phone</label><input type="tel" inputMode="numeric" placeholder="e.g. (555) 123-4567" style={inputStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: formatPhoneAsTyped(e.target.value) }))} /></div>
            <div><label style={fieldLabel}>Email</label><input type="email" style={inputStyle} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><label style={fieldLabel}>Time Zone</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.timeZone} onChange={e => setForm(f => ({ ...f, timeZone: e.target.value }))}>
                <option value="">Select</option>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            <div><label style={fieldLabel}>Age</label><input style={inputStyle} value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} placeholder="e.g., 30s, 40s" /></div>
            <div><label style={fieldLabel}>Occupation</label><input style={inputStyle} value={form.occupation} onChange={e => setForm(f => ({ ...f, occupation: e.target.value }))} /></div>
            <div><label style={fieldLabel}>Category</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">Select</option>
                {PARTNER_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div><label style={fieldLabel}>Character Traits</label><input style={inputStyle} value={form.characterTraits} onChange={e => setForm(f => ({ ...f, characterTraits: e.target.value }))} placeholder="e.g., Hard worker, Disciplined" /></div>
            <div><label style={fieldLabel}>Appt Date</label><DatePicker value={form.appointmentDate} onChange={v => setForm(f => ({ ...f, appointmentDate: v }))} /></div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingTop: 18 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9BB0C4', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.married} onChange={e => setForm(f => ({ ...f, married: e.target.checked }))} /> Married
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9BB0C4', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.children} onChange={e => setForm(f => ({ ...f, children: e.target.checked }))} /> Children
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9BB0C4', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.homeowner} onChange={e => setForm(f => ({ ...f, homeowner: e.target.checked }))} /> Homeowner
              </label>
            </div>
            <div><label style={fieldLabel}>1st Call</label><DatePicker value={form.firstCallDate} onChange={v => setForm(f => ({ ...f, firstCallDate: v }))} /></div>
            <div><label style={fieldLabel}>2nd Call</label><DatePicker value={form.secondCallDate} onChange={v => setForm(f => ({ ...f, secondCallDate: v }))} /></div>
            <div style={{ gridColumn: isMobile ? undefined : 'span 3' }}><label style={fieldLabel}>Notes</label><input style={inputStyle} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            {editingId && (() => {
              const linked = partners.find(p => p.id === editingId)?.linkedAgentProfile
              if (!linked?.npn && !linked?.licenseNumber) return null
              return (
                <div style={{ gridColumn: isMobile ? undefined : 'span 3', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B8299' }}>Agent Info:</span>
                  <LinkedAgentChips linked={linked} />
                </div>
              )
            })()}
            <div style={{ gridColumn: isMobile ? undefined : 'span 3', display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="submit" disabled={saving} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : editingId ? 'Update' : 'Save & add another'}</button>
              <button type="button" onClick={() => { resetForm(); setRecentlyAddedCount(0) }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6B8299', borderRadius: 4, padding: '6px 14px', fontSize: 11, cursor: 'pointer' }}>{editingId ? 'Cancel' : 'Done'}</button>
              {recentlyAddedCount > 0 && !editingId && (
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: '#4ADE80', background: 'rgba(74,222,128,0.10)',
                  border: '1px solid rgba(74,222,128,0.3)',
                  padding: '4px 10px', borderRadius: 999,
                }}>
                  &#10003; Saved &middot; {recentlyAddedCount} added this session
                </span>
              )}
            </div>
          </form>
        )}

        {loading ? <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div> :
          sorted.length === 0 ? (
            <div style={{ color: '#4B5563', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
              {view === 'queue' && (search || showStaleOnly ? 'No contacts match those filters.' : 'Queue is empty. Tap "Import CSV" to add contacts from your phone.')}
              {view === 'business_partners' && 'No business partner prospects yet. Classify someone from the queue to get started.'}
              {view === 'fta' && 'No FTA contacts yet. Classify someone from the queue to get started.'}
              {view === 'skipped' && 'No skipped contacts.'}
            </div>
          ) :
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 28 }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '14%' }} />
                {view !== 'queue' && <col style={{ width: 110 }} />}
                {!isMobile && <col style={{ width: '14%' }} />}
                {!isMobile && <col style={{ width: 100 }} />}
                <col style={{ width: 120 }} />
              </colgroup>
              <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <th style={{ ...thStyle, padding: '8px 6px' }}>
                  <input type="checkbox" checked={allSelected} onChange={e => selectAll(e.target.checked)} />
                </th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Phone</th>
                {view !== 'queue' && <th style={thStyle}>Stage</th>}
                {!isMobile && <th style={thStyle}>Occupation</th>}
                {!isMobile && <th style={thStyle}>Last Contact</th>}
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr></thead>
              <tbody>{sorted.map(p => {
                const isSelected = effectiveSelection.has(p.id)
                const isStale = (p.lastContactAt ?? p.createdAt) ? new Date(p.lastContactAt ?? p.createdAt!).getTime() < staleThreshold : true
                const truncStyle: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                const cardCols = 5 + (view !== 'queue' ? 1 : 0) + (!isMobile ? 2 : 0)
                const cardLbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 3 }
                const cardVal: React.CSSProperties = { fontSize: 12, color: '#C7D3E0', lineHeight: 1.5, wordBreak: 'break-word' }
                const yn = (b: boolean) => b ? 'Yes' : 'No'
                const dt = (s: string | null) => s ? new Date(s).toLocaleDateString() : '—'
                return (
                  <React.Fragment key={p.id}>
                  <tr style={{
                    borderBottom: expandedCardId === p.id ? 'none' : '1px solid rgba(255,255,255,0.03)',
                    background: isSelected ? 'rgba(201,169,110,0.06)' : 'transparent',
                  }}>
                    <td style={{ ...tdStyle, padding: '8px 6px' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)} />
                    </td>
                    <td
                      title="Chevron: full contact card · name: edit"
                      style={{ ...tdStyle, ...truncStyle, color: '#ffffff', fontWeight: 500 }}
                    >
                      <button
                        onClick={() => setExpandedCardId(cur => cur === p.id ? null : p.id)}
                        title={expandedCardId === p.id ? 'Hide full contact card' : 'Show full contact card (notes, character traits, MACHO)'}
                        aria-label="Toggle full contact card"
                        style={{ background: 'none', border: 'none', color: expandedCardId === p.id ? '#C9A96E' : '#6B8299', cursor: 'pointer', padding: '0 6px 0 0', fontSize: 10, lineHeight: 1 }}
                      >
                        {expandedCardId === p.id ? '▾' : '▸'}
                      </button>
                      <span onClick={() => startEdit(p)} style={{ cursor: 'pointer' }}>{p.name}</span>
                      <LinkedAgentChips linked={p.linkedAgentProfile} />
                    </td>
                    <td style={{ ...tdStyle, ...truncStyle }} title={p.email ?? ''}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email ?? ''}</span>
                        <EmailButton email={p.email} size="sm" label={false} />
                      </span>
                    </td>
                    <td style={{ ...tdStyle, ...truncStyle }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span>{p.phone ?? ''}</span>
                        <CallButton phone={p.phone} size="sm" label={false} />
                      </span>
                    </td>
                    {view !== 'queue' && (
                      <td style={tdStyle}>
                        <select
                          value={p.status}
                          onChange={e => {
                            if (e.target.value === 'BOOKED' && p.category === 'fta_contact') {
                              setScheduleFtaPartner(p); setScheduleFtaDate(''); e.target.value = p.status
                            } else {
                              advanceOne(p.id, e.target.value)
                            }
                          }}
                          title="Change stage"
                          style={{
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                            padding: '3px 8px', borderRadius: 3,
                            background: `${STATUS_COLOR[p.status] ?? '#6B8299'}15`,
                            border: `1px solid ${STATUS_COLOR[p.status] ?? '#6B8299'}40`,
                            color: STATUS_COLOR[p.status] ?? '#6B8299',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            maxWidth: '100%',
                          }}
                        >
                          {(view === 'business_partners'
                            ? ['NEW', 'CONTACTED', 'INTRO_SENT', 'BOOKED', 'CONVERTED']
                            : view === 'fta'
                              ? ['NEW', 'CONTACTED']
                              : ['PENDING', 'NEW', 'CONTACTED', 'BOOKED', 'CONVERTED', 'SKIPPED']
                          ).map(s => (
                            <option key={s} value={s} style={{ background: '#0F1E33', color: '#fff' }}>
                              {STATUS_LABEL[s] ?? s}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    {!isMobile && (
                      <td style={{ ...tdStyle, ...truncStyle }} title={p.occupation ?? ''}>{p.occupation ?? ''}</td>
                    )}
                    {!isMobile && (
                      <td style={{ ...tdStyle, ...truncStyle, color: isStale ? '#f59e0b' : '#9BB0C4' }}>
                        {p.lastContactAt ? new Date(p.lastContactAt).toLocaleDateString() : (p.createdAt ? `imp ${new Date(p.createdAt).toLocaleDateString()}` : '')}
                      </td>
                    )}
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {/* Queue view: classify or skip in one tap */}
                      {view === 'queue' && (
                        <>
                          <button onClick={() => classifyOne(p.id, 'business_partner')} title="Classify as Business Partner Prospect" style={{ background: 'rgba(155,109,255,0.15)', border: '1px solid rgba(155,109,255,0.4)', color: '#9B6DFF', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', marginRight: 6 }}>BP</button>
                          <button onClick={() => classifyOne(p.id, 'fta_contact')} title="Classify as FTA Contact" style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.4)', color: '#60A5FA', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', marginRight: 6 }}>FTA</button>
                          <button onClick={() => skipOne(p.id)} title="Skip (kept but hidden from queue)" style={{ background: 'transparent', border: '1px solid rgba(107,130,153,0.4)', color: '#9BB0C4', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', marginRight: 6 }}>SKIP</button>
                        </>
                      )}
                      {/* Business Partner lane: CEO intro + stage advance */}
                      {view === 'business_partners' && (
                        <>
                          <button onClick={() => classifyOne(p.id, 'fta_contact')} title="Misclassified? Move this contact to FTA Contacts" style={{ background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.35)', color: '#60A5FA', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', marginRight: 6 }}>&rarr; FTA</button>
                          {p.introSentAt ? (
                            <span style={{ fontSize: 9, color: '#4ade80', marginRight: 8, fontWeight: 700 }} title={`Sent ${new Date(p.introSentAt).toLocaleDateString()}`}>&check; INTRO</span>
                          ) : (
                            <button onClick={() => { setIntroModalPartner(p); setIntroNote(''); setIntroError(null) }} disabled={!p.email} title={p.email ? 'Have Vick send a warm intro' : 'Add an email first'} style={{ background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.3)', color: p.email ? '#C9A96E' : '#4B5563', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, cursor: p.email ? 'pointer' : 'not-allowed', marginRight: 6 }}>CEO INTRO</button>
                          )}
                          {p.status !== 'BOOKED' && p.status !== 'CONVERTED' && (
                            p.category === 'fta_contact'
                              ? <button onClick={() => { setScheduleFtaPartner(p); setScheduleFtaDate('') }} title="Schedule an FTA with this contact" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color: '#F59E0B', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', marginRight: 6 }}>SCHEDULE FTA</button>
                              : <button onClick={() => advanceOne(p.id, 'BOOKED')} title="Mark as Booked" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color: '#F59E0B', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', marginRight: 6 }}>BOOKED</button>
                          )}
                          {p.status !== 'CONVERTED' && (
                            <button onClick={() => advanceOne(p.id, 'CONVERTED')} title="Mark as Converted (joined / closed)" style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.35)', color: '#4ade80', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', marginRight: 6 }}>CONVERTED</button>
                          )}
                        </>
                      )}
                      {/* FTA lane: stage advance */}
                      {view === 'fta' && (
                        <>
                          <button onClick={() => classifyOne(p.id, 'business_partner')} title="Misclassified? Move this contact to Business Partners" style={{ background: 'rgba(155,109,255,0.12)', border: '1px solid rgba(155,109,255,0.35)', color: '#9B6DFF', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', marginRight: 6 }}>&rarr; BP</button>
                          {p.status === 'NEW' && (
                            <button onClick={() => advanceOne(p.id, 'CONTACTED')} title="Mark as Contacted" style={{ background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.3)', color: '#C9A96E', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', marginRight: 6 }}>CONTACTED</button>
                          )}
                          {p.status !== 'BOOKED' && p.status !== 'CONVERTED' && (
                            <button
                              onClick={() => {
                                // Default the date to "tomorrow at 6pm" - more useful
                                // than blank, easy to overwrite if the agent has a real
                                // booked time. ISO local format for the datetime-local input.
                                const t = new Date()
                                t.setDate(t.getDate() + 1)
                                t.setHours(18, 0, 0, 0)
                                const pad = (n: number) => String(n).padStart(2, '0')
                                const def = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`
                                setScheduleFtaDate(def)
                                setScheduleFtaError(null)
                                setScheduleFtaPartner(p)
                              }}
                              title="Schedule a Field Training Appointment with this contact"
                              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color: '#F59E0B', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', marginRight: 6 }}
                            >
                              SCHEDULE FTA
                            </button>
                          )}
                          {p.status !== 'CONVERTED' && (
                            <button onClick={() => advanceOne(p.id, 'CONVERTED')} title="Mark as Trained / Closed" style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.35)', color: '#4ade80', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', marginRight: 6 }}>DONE</button>
                          )}
                        </>
                      )}
                      {/* Skipped: only un-skip available */}
                      {view === 'skipped' && (
                        <button onClick={() => advanceOne(p.id, p.category ? 'NEW' : 'PENDING')} title="Move back to active" style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.4)', color: '#60A5FA', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', marginRight: 6 }}>UNSKIP</button>
                      )}
                      <button onClick={() => deleteOne(p.id)} title="Delete this contact permanently" style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.35)', color: '#f87171', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, cursor: 'pointer' }}>DELETE</button>
                    </td>
                  </tr>
                  {expandedCardId === p.id && (
                    <tr style={{ background: 'rgba(201,169,110,0.045)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td colSpan={cardCols} style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px 24px' }}>
                          <div><div style={cardLbl}>Age</div><div style={cardVal}>{p.age || '—'}</div></div>
                          <div><div style={cardLbl}>Occupation</div><div style={cardVal}>{p.occupation || '—'}</div></div>
                          <div><div style={cardLbl}>Time Zone</div><div style={cardVal}>{p.timeZone || '—'}</div></div>
                          <div><div style={cardLbl}>Category</div><div style={cardVal}>{p.category || '—'}</div></div>
                          <div><div style={cardLbl}>Married</div><div style={cardVal}>{yn(p.married)}</div></div>
                          <div><div style={cardLbl}>Children</div><div style={cardVal}>{yn(p.children)}</div></div>
                          <div><div style={cardLbl}>Homeowner</div><div style={cardVal}>{yn(p.homeowner)}</div></div>
                          <div><div style={cardLbl}>Booked Appt</div><div style={cardVal}>{yn(p.bookedAppt)}</div></div>
                          <div><div style={cardLbl}>Appointment</div><div style={cardVal}>{dt(p.appointmentDate)}</div></div>
                          <div><div style={cardLbl}>1st Call</div><div style={cardVal}>{dt(p.firstCallDate)}</div></div>
                          <div><div style={cardLbl}>2nd Call</div><div style={cardVal}>{dt(p.secondCallDate)}</div></div>
                          <div><div style={cardLbl}>Last Contact</div><div style={cardVal}>{dt(p.lastContactAt)}</div></div>
                          {p.linkedAgentProfile && (
                            <>
                              <div><div style={cardLbl}>NPN</div><div style={cardVal}>{p.linkedAgentProfile.npn || '—'}</div></div>
                              <div><div style={cardLbl}>License #</div><div style={cardVal}>{p.linkedAgentProfile.licenseNumber || '—'}</div></div>
                            </>
                          )}
                        </div>
                        <div style={{ marginTop: 14 }}>
                          <div style={cardLbl}>Character Traits</div>
                          <div style={{ ...cardVal, whiteSpace: 'pre-wrap' }}>{p.characterTraits || '—'}</div>
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <div style={cardLbl}>Notes</div>
                          <div style={{ ...cardVal, whiteSpace: 'pre-wrap' }}>{p.notes || '—'}</div>
                        </div>
                        <div style={{ marginTop: 14, textAlign: 'right' }}>
                          <button
                            onClick={() => startEdit(p)}
                            style={{ background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.3)', color: '#C9A96E', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 3, cursor: 'pointer' }}
                          >
                            Edit full card
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                )
              })}</tbody>
            </table>
          </div>
        }
      </div>

      {importOpen && (
        <ImportModal
          preview={importPreview}
          bulkCategory={importBulkCategory}
          setBulkCategory={setImportBulkCategory}
          onPickFile={handleImportFile}
          onCommit={handleImportCommit}
          onClose={() => { setImportOpen(false); setImportPreview(null); setImportError(null) }}
          onChangeRow={(idx, patch) => setImportPreview(prev => prev ? prev.map((r, i) => i === idx ? { ...r, ...patch } : r) : prev)}
          busy={importBusy}
          error={importError}
          isMobile={isMobile}
        />
      )}

      {introModalPartner && (
        <IntroModal
          partner={introModalPartner}
          note={introNote}
          setNote={setIntroNote}
          onSend={handleSendIntro}
          onClose={() => { setIntroModalPartner(null); setIntroNote('') }}
          sending={introSending}
          error={introError}
        />
      )}

      {scheduleFtaPartner && (
        <ScheduleFtaModal
          partner={scheduleFtaPartner}
          date={scheduleFtaDate}
          setDate={setScheduleFtaDate}
          onSchedule={scheduleFta}
          onClose={() => { setScheduleFtaPartner(null); setScheduleFtaDate('') }}
          saving={scheduleFtaSaving}
          error={scheduleFtaError}
        />
      )}
    </div>
  )
}

// ─── Import + Intro Modals ─────────────────────────────────────────────────────

function ImportModal({
  preview, bulkCategory, setBulkCategory,
  onPickFile, onCommit, onClose, onChangeRow,
  busy, error, isMobile,
}: {
  preview: ImportPreviewRow[] | null
  bulkCategory: string
  setBulkCategory: (v: string) => void
  onPickFile: (f: File) => void
  onCommit: () => void
  onClose: () => void
  onChangeRow: (idx: number, patch: Partial<ImportPreviewRow>) => void
  busy: boolean
  error: string | null
  isMobile: boolean
}) {
  const selectedCount = preview?.filter(r => r.selected).length ?? 0

  const applyBulkCategory = () => {
    if (!preview || !bulkCategory) return
    preview.forEach((_, i) => onChangeRow(i, { category: bulkCategory }))
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0F1E33', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 8, width: '100%', maxWidth: 920, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(201,169,110,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Import Contacts</div>
            <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
              {preview ? `${selectedCount} of ${preview.length} selected — classify each contact and confirm` : 'Export your phone contacts as CSV (Google Contacts, Apple Numbers, Outlook all work)'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9BB0C4', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {!preview && (
          <div style={{ padding: '28px 24px' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <label style={{ display: 'inline-block', cursor: busy ? 'wait' : 'pointer', background: '#C9A96E', color: '#142D48', padding: '14px 32px', borderRadius: 4, fontSize: 14, fontWeight: 700 }}>
                {busy ? 'Reading...' : 'Choose CSV file'}
                <input
                  type="file" accept=".csv,text/csv" hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) onPickFile(f) }}
                  disabled={busy}
                />
              </label>
              <div style={{ fontSize: 11, color: '#6B8299', marginTop: 8 }}>
                Up to 500 contacts per import. We never share your contact list.
              </div>
            </div>

            {/* Per-platform instructions, two compact columns on desktop */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              {/* iPhone */}
              <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,169,110,0.15)', borderRadius: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 10 }}>
                  iPhone
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#9BB0C4', lineHeight: 1.7 }}>
                  <li>Open the <strong style={{ color: '#fff' }}>Contacts</strong> app.</li>
                  <li>Tap <strong style={{ color: '#fff' }}>Lists</strong> in the top-left, then <strong style={{ color: '#fff' }}>All Contacts</strong>.</li>
                  <li><strong style={{ color: '#fff' }}>Press and hold</strong> on any contact until a menu appears. Tap <strong style={{ color: '#fff' }}>Select</strong>.</li>
                  <li>Tap each contact you want to import. Or tap <strong style={{ color: '#fff' }}>Select All</strong>.</li>
                  <li>Tap <strong style={{ color: '#fff' }}>Share</strong>, then <strong style={{ color: '#fff' }}>Save to Files</strong>. This creates a <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0 4px', borderRadius: 2, fontSize: 11 }}>.vcf</code> file.</li>
                  <li>Open <a href="https://www.vcardtocsv.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#C9A96E' }}>vcardtocsv.com</a> on your phone, upload the file, download the CSV.</li>
                  <li>Come back here and tap <strong style={{ color: '#fff' }}>Choose CSV file</strong> above.</li>
                </ol>
              </div>

              {/* Android */}
              <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#60A5FA', marginBottom: 10 }}>
                  Android (Google Contacts)
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#9BB0C4', lineHeight: 1.7 }}>
                  <li>On your phone or laptop, open <a href="https://contacts.google.com" target="_blank" rel="noopener noreferrer" style={{ color: '#60A5FA' }}>contacts.google.com</a>.</li>
                  <li>Tap <strong style={{ color: '#fff' }}>Export</strong> in the left menu (Settings on mobile).</li>
                  <li>Pick <strong style={{ color: '#fff' }}>Selected contacts</strong> or <strong style={{ color: '#fff' }}>All contacts</strong>.</li>
                  <li>Choose <strong style={{ color: '#fff' }}>Google CSV</strong> as the format.</li>
                  <li>Tap <strong style={{ color: '#fff' }}>Export</strong> and save the file.</li>
                  <li>Come back here and tap <strong style={{ color: '#fff' }}>Choose CSV file</strong> above.</li>
                </ol>
              </div>
            </div>

            <div style={{ marginTop: 16, fontSize: 11, color: '#4B5563', textAlign: 'center', lineHeight: 1.6 }}>
              We auto-detect Name, Email, Phone, and Occupation from any of these formats. Imports land in your <strong style={{ color: '#9BB0C4' }}>Queue</strong>; classify each as a Business Partner or FTA contact afterwards.
            </div>
          </div>
        )}

        {preview && (
          <>
            <div style={{ padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#9BB0C4' }}>Bulk classify all rows as</span>
              <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} style={{ background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', color: '#9BB0C4', borderRadius: 4, padding: '6px 10px', fontSize: 11 }}>
                <option value="">Pick a category...</option>
                {PARTNER_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <button onClick={applyBulkCategory} disabled={!bulkCategory} style={{ background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.3)', color: '#C9A96E', fontSize: 10, fontWeight: 700, padding: '5px 12px', borderRadius: 3, cursor: bulkCategory ? 'pointer' : 'not-allowed' }}>
                Apply to all
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'sticky', top: 0, background: '#0F1E33' }}>
                  {['', 'Name', 'Email', 'Phone', isMobile ? null : 'Occupation', 'Classify as'].filter(Boolean).map(h => (
                    <th key={String(h)} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C9A96E' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', opacity: r.selected ? 1 : 0.45 }}>
                      <td style={{ padding: '6px 10px' }}>
                        <input type="checkbox" checked={r.selected} onChange={e => onChangeRow(i, { selected: e.target.checked })} />
                      </td>
                      <td style={{ padding: '6px 10px', fontSize: 12, color: '#fff' }}>{r.name}</td>
                      <td style={{ padding: '6px 10px', fontSize: 11, color: '#9BB0C4' }}>{r.email ?? '—'}</td>
                      <td style={{ padding: '6px 10px', fontSize: 11, color: '#9BB0C4' }}>{r.phone ?? '—'}</td>
                      {!isMobile && <td style={{ padding: '6px 10px', fontSize: 11, color: '#9BB0C4' }}>{r.occupation ?? '—'}</td>}
                      <td style={{ padding: '6px 10px' }}>
                        <select value={r.category} onChange={e => onChangeRow(i, { category: e.target.value })} style={{ background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', color: '#9BB0C4', borderRadius: 4, padding: '4px 8px', fontSize: 11 }}>
                          <option value="">Unclassified</option>
                          {PARTNER_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {error && <div style={{ padding: '8px 24px', fontSize: 11, color: '#f87171' }}>{error}</div>}
        {preview && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(201,169,110,0.12)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', borderRadius: 4, padding: '8px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button onClick={onCommit} disabled={busy || selectedCount === 0} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '8px 18px', fontSize: 11, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy || selectedCount === 0 ? 0.6 : 1 }}>
              {busy ? 'Importing...' : `Import ${selectedCount} contact${selectedCount === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function IntroModal({
  partner, note, setNote, onSend, onClose, sending, error,
}: {
  partner: Partner
  note: string
  setNote: (v: string) => void
  onSend: () => void
  onClose: () => void
  sending: boolean
  error: string | null
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0F1E33', border: '1px solid rgba(201,169,110,0.2)', borderRadius: 8, width: '100%', maxWidth: 520 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(201,169,110,0.12)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Send a CEO intro to {partner.name}</div>
          <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
            Vick will email <span style={{ color: '#9BB0C4' }}>{partner.email ?? '—'}</span> from his address. The note below is quoted in the email above his signature.
          </div>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E', display: 'block', marginBottom: 6 }}>
            Personal note (optional)
          </label>
          <textarea
            value={note} onChange={e => setNote(e.target.value)}
            rows={4} maxLength={500}
            placeholder="e.g. We grabbed coffee last month and I really think you'd love what we're building."
            style={{ width: '100%', background: '#0A1628', border: '1px solid rgba(201,169,110,0.2)', color: '#9BB0C4', borderRadius: 4, padding: '10px 12px', fontSize: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
          <div style={{ fontSize: 10, color: '#4B5563', marginTop: 4 }}>{note.length} / 500</div>
        </div>
        {error && <div style={{ padding: '0 24px 12px', fontSize: 11, color: '#f87171' }}>{error}</div>}
        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(201,169,110,0.12)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={sending} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', borderRadius: 4, padding: '8px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onSend} disabled={sending} style={{ background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4, padding: '8px 18px', fontSize: 11, fontWeight: 700, cursor: sending ? 'wait' : 'pointer', opacity: sending ? 0.6 : 1 }}>
            {sending ? 'Sending...' : 'Send the intro'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Small modal for "Schedule FTA from a contact." Single date input;
// the contact's existing name/phone/notes carry over server-side so
// the agent doesn't have to retype everything they already classified.
function ScheduleFtaModal({
  partner, date, setDate, onSchedule, onClose, saving, error,
}: {
  partner: Partner
  date: string
  setDate: (v: string) => void
  onSchedule: () => void
  onClose: () => void
  saving: boolean
  error: string | null
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0F1E33', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, width: '100%', maxWidth: 460 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(245,158,11,0.18)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Schedule FTA with {partner.name}</div>
          <div style={{ fontSize: 11, color: '#6B8299', marginTop: 2 }}>
            Pick a date and time. We&apos;ll mark {partner.name.split(/\s+/)[0]} as Booked under the FTA Contacts lane.
          </div>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F59E0B', display: 'block', marginBottom: 6 }}>
            Appointment date &amp; time
          </label>
          <DateTimePicker value={date} onChange={setDate} />
          <div style={{ fontSize: 10, color: '#6B8299', marginTop: 8, lineHeight: 1.55 }}>
            Their contact details ({partner.phone ?? 'no phone'}) carry over automatically. You can update them anytime from the FTA Contacts lane.
          </div>
        </div>
        {error && <div style={{ padding: '0 24px 12px', fontSize: 11, color: '#f87171' }}>{error}</div>}
        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(245,158,11,0.18)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9BB0C4', borderRadius: 4, padding: '8px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onSchedule} disabled={saving || !date} style={{ background: '#F59E0B', color: '#0A1628', border: 'none', borderRadius: 4, padding: '8px 18px', fontSize: 11, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving || !date ? 0.6 : 1 }}>
            {saving ? 'Scheduling...' : 'Schedule FTA'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Call Logs Tab ─────────────────────────────────────────────────────────────

const OUTCOME_LABEL: Record<string, string> = {
  RECRUITED:           'Recruited',
  APPOINTMENT_BOOKED:  'Appt Booked',
  POLICY_CLOSED:       'Policy Closed',
  FOLLOW_UP_SCHEDULED: 'Follow-up',
  NOT_INTERESTED:      'Not Interested',
  NO_CONTACT:          'No Contact',
}
const POSITIVE_OUTCOMES = new Set(['RECRUITED', 'APPOINTMENT_BOOKED', 'POLICY_CLOSED'])

const CALL_TYPE_LABEL: Record<string, string> = {
  RECRUIT:            'Recruit',
  FOLLOW_UP:          'Follow-up',
  CLIENT_APPOINTMENT: 'Client Appointment',
  OTHER:              'Other',
}

// Resolves the call's intent/category for display in the list and
// detail views. OTHER falls back to whatever the agent typed in the
// callTypeOther free-text field. Returns null if the row predates the
// callType columns and only carries the deprecated free-form result.
function formatCallType(call: { callType: string | null; callTypeOther: string | null }): string | null {
  if (!call.callType) return null
  if (call.callType === 'OTHER' && call.callTypeOther?.trim()) return call.callTypeOther.trim()
  return CALL_TYPE_LABEL[call.callType] ?? call.callType
}

interface CallLogRow {
  id: string
  callDate: string
  contactName: string
  phoneNumber: string | null
  subject: string | null
  // Deprecated, surfaced from the row only for back-compat with old
  // entries that used the free-form Result field. New rows leave it
  // null and use callType/callTypeOther instead.
  result: string | null
  callType: string | null
  callTypeOther: string | null
  outcome: string | null
  followUpNeeded: boolean
  review: {
    id: string
    overallScore: number
    flaggedForCoaching: boolean
    reviewedAt: string
  } | null
}

function CallLogsTab({ hasCft, previewToken }: { hasCft: boolean; previewToken?: string | null }) {
  const isMobile = useIsMobile()
  const [calls, setCalls] = useState<CallLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    callDate: new Date().toISOString().split('T')[0],
    contactName: '',
    phoneNumber: '',
    subject: '',
    callType: '',
    callTypeOther: '',
    outcome: '',
    followUpNeeded: false,
    transcriptText: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [analyzingCallIds, setAnalyzingCallIds] = useState<Set<string>>(new Set())
  const [viewingReview, setViewingReview] = useState<{
    call: CallLogRow
    review: CallReviewData
    scriptName: string | null
    scriptResourceUrl: string | null
  } | null>(null)

  const fetchCalls = useCallback(() => {
    const url = previewToken ? `/api/agents/calls?preview=${previewToken}` : '/api/agents/calls'
    fetch(url)
      .then(r => r.json())
      .then((d: { calls: CallLogRow[] }) => {
        setCalls(d.calls ?? [])
        setLoading(false)
      })
  }, [previewToken])

  useEffect(() => { fetchCalls() }, [fetchCalls])

  // Poll for review completion on any analyzing calls
  useEffect(() => {
    if (analyzingCallIds.size === 0) return
    const timer = setInterval(async () => {
      for (const callId of analyzingCallIds) {
        const res = await fetch(`/api/agents/calls/${callId}/review`)
        if (res.ok) {
          const data = await res.json() as { review: CallReviewData | null }
          if (data.review) {
            setAnalyzingCallIds(prev => {
              const next = new Set(prev)
              next.delete(callId)
              return next
            })
            setCalls(prev => prev.map(c => c.id === callId ? {
              ...c,
              review: {
                id: data.review!.id,
                overallScore: data.review!.overallScore,
                flaggedForCoaching: data.review!.flaggedForCoaching,
                reviewedAt: data.review!.reviewedAt,
              },
            } : c))
          }
        }
      }
    }, 2500)
    return () => clearInterval(timer)
  }, [analyzingCallIds])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/agents/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Failed to save call')
        setSubmitting(false)
        return
      }
      const data = await res.json() as { call: CallLogRow; hasTranscript: boolean }
      const newCall: CallLogRow = { ...data.call, review: null }
      setCalls(prev => [newCall, ...prev])
      setForm({
        callDate: new Date().toISOString().split('T')[0],
        contactName: '', phoneNumber: '', subject: '',
        callType: '', callTypeOther: '',
        outcome: '', followUpNeeded: false, transcriptText: '',
      })
      setShowForm(false)
      setSubmitting(false)

      // If transcript submitted, trigger analysis
      if (data.hasTranscript) {
        setAnalyzingCallIds(prev => new Set(prev).add(newCall.id))
        fetch(`/api/agents/calls/${newCall.id}/review`, { method: 'POST' })
          .then(r => r.json())
          .then((d: { review?: CallReviewData; error?: string }) => {
            if (d.review) {
              setAnalyzingCallIds(prev => {
                const next = new Set(prev)
                next.delete(newCall.id)
                return next
              })
              setCalls(prev => prev.map(c => c.id === newCall.id ? {
                ...c,
                review: {
                  id: d.review!.id,
                  overallScore: d.review!.overallScore,
                  flaggedForCoaching: d.review!.flaggedForCoaching,
                  reviewedAt: d.review!.reviewedAt,
                },
              } : c))
            } else if (d.error) {
              setAnalyzingCallIds(prev => {
                const next = new Set(prev)
                next.delete(newCall.id)
                return next
              })
              setError(d.error)
            }
          })
      }
    } catch {
      setError('Network error — please try again')
      setSubmitting(false)
    }
  }

  const openReview = async (call: CallLogRow) => {
    if (!call.review) return
    const res = await fetch(`/api/agents/calls/${call.id}/review`)
    if (!res.ok) return
    const data = await res.json() as {
      review: CallReviewData | null
      scriptName?: string | null
      scriptResourceUrl?: string | null
    }
    if (data.review) {
      setViewingReview({
        call,
        review: data.review,
        scriptName: data.scriptName ?? null,
        scriptResourceUrl: data.scriptResourceUrl ?? null,
      })
    }
  }

  const formRow: React.CSSProperties = isMobile
    ? { display: 'flex', flexDirection: 'column', gap: 12 }
    : { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }

  return (
    <>
      <div style={{ ...card, padding: isMobile ? '18px 16px' : '24px 28px' }}>
        {/* ── Hero explainer card ── */}
        <div style={{
          marginBottom: 20,
          padding: '16px 18px',
          borderRadius: 6,
          background: hasCft
            ? 'linear-gradient(135deg, rgba(201,169,110,0.08), rgba(201,169,110,0.02))'
            : 'linear-gradient(135deg, rgba(201,169,110,0.12), rgba(201,169,110,0.04))',
          border: '1px solid rgba(201,169,110,0.25)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(201,169,110,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(201,169,110,0.35)',
              flexShrink: 0,
            }}>
              <span style={{ color: '#C9A96E', fontSize: 13 }}>{hasCft ? '◆' : '❖'}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>
              {hasCft ? 'AI Call Coaching' : 'AI Call Coaching · CFT Perk'}
            </div>
            {hasCft && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                padding: '2px 8px', borderRadius: 999,
                background: 'rgba(201,169,110,0.18)', color: '#C9A96E',
                border: '1px solid rgba(201,169,110,0.4)',
              }}>UNLOCKED</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.55 }}>
            {hasCft ? (
              <>After each call, paste your Fathom transcript here. Claude reviews it against the AFF script and NEPQ methodology and gives you concrete coaching tips in about 10 seconds. Your scores stay private (for your growth, not a leaderboard). Trainers can see them to coach you, but nothing affects phase promotion.</>
            ) : (
              <>Personalized coaching by JLM, graded against the AFF script you&apos;re running. Unlocks when you earn your <span style={{ color: '#C9A96E', fontWeight: 700 }}>CFT</span> certification, completing the four Phase 3 sign-offs (CFT classes, trainer sign-off, coordinator sign-off, EMD sign-off). You can still log calls below; the AI analyzer activates the moment your CFT badge lands.</>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
          <div style={sectionLabel}>Call Logs ({calls.length})</div>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              background: '#C9A96E', color: '#142D48', border: 'none', borderRadius: 4,
              padding: '10px 16px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: 'pointer', minHeight: 40,
            }}
          >
            {showForm ? 'Cancel' : '+ Log Call'}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={add}
            style={{
              marginBottom: 20,
              display: 'flex', flexDirection: 'column', gap: 12,
              padding: 16, background: 'rgba(255,255,255,0.02)',
              borderRadius: 6, border: '1px solid rgba(201,169,110,0.1)',
            }}
          >
            <div style={formRow}>
              <div>
                <label style={fieldLabel}>Date *</label>
                <DatePicker
                  required
                  value={form.callDate}
                  onChange={v => setForm(f => ({ ...f, callDate: v }))}
                />
              </div>
              <div>
                <label style={fieldLabel}>Contact Name *</label>
                <input
                  required style={inputStyle}
                  value={form.contactName}
                  onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
                />
              </div>
            </div>
            <div style={formRow}>
              <div>
                <label style={fieldLabel}>Phone</label>
                <input
                  style={inputStyle} inputMode="tel"
                  value={form.phoneNumber}
                  onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))}
                />
              </div>
              <div>
                <label style={fieldLabel}>Subject</label>
                <input
                  style={inputStyle}
                  value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                />
              </div>
            </div>
            <div style={formRow}>
              <div>
                <label style={fieldLabel}>Call Type</label>
                <select
                  value={form.callType}
                  onChange={e => setForm(f => ({ ...f, callType: e.target.value, callTypeOther: e.target.value === 'OTHER' ? f.callTypeOther : '' }))}
                  style={{ ...inputStyle, appearance: 'none' as const }}
                >
                  <option value="">Select type (optional)</option>
                  <option value="RECRUIT">Recruit</option>
                  <option value="FOLLOW_UP">Follow-up</option>
                  <option value="CLIENT_APPOINTMENT">Client Appointment / Close</option>
                  <option value="OTHER">Other...</option>
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Outcome</label>
                <select
                  value={form.outcome}
                  onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))}
                  style={{ ...inputStyle, appearance: 'none' as const }}
                >
                  <option value="">Select outcome (optional)</option>
                  <option value="RECRUITED">Recruited</option>
                  <option value="APPOINTMENT_BOOKED">Appointment Booked</option>
                  <option value="POLICY_CLOSED">Policy Closed</option>
                  <option value="FOLLOW_UP_SCHEDULED">Follow-up Scheduled</option>
                  <option value="NOT_INTERESTED">Not Interested</option>
                  <option value="NO_CONTACT">No Contact / No Answer</option>
                </select>
              </div>
            </div>
            {/* Free-text label for OTHER call types so an agent can
                tag an ad-hoc call ('underwriting check-in', etc.)
                without polluting the dropdown with rare cases. */}
            {form.callType === 'OTHER' && (
              <div>
                <label style={fieldLabel}>Other (specify)</label>
                <input
                  style={inputStyle}
                  placeholder="e.g. underwriting check-in, carrier callback"
                  value={form.callTypeOther}
                  onChange={e => setForm(f => ({ ...f, callTypeOther: e.target.value }))}
                />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32 }}>
              <input
                type="checkbox" id="fu"
                checked={form.followUpNeeded}
                onChange={e => setForm(f => ({ ...f, followUpNeeded: e.target.checked }))}
                style={{ accentColor: '#C9A96E', width: 16, height: 16 }}
              />
              <label htmlFor="fu" style={{ fontSize: 12, color: '#9BB0C4', cursor: 'pointer' }}>
                Follow-up needed
              </label>
            </div>

            {/* Transcript section — gated on CFT badge. Non-CFT agents
                can still log calls but the AI analyzer is positioned as a
                CFT-tier perk so they have a concrete reason to push for
                certification. */}
            {hasCft ? (
              <div style={{ borderTop: '1px dashed rgba(201,169,110,0.15)', paddingTop: 14, marginTop: 4 }}>
                <label style={{ ...fieldLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#C9A96E' }}>◆</span> Paste Fathom Transcript (optional)
                </label>
                <textarea
                  value={form.transcriptText}
                  onChange={e => setForm(f => ({ ...f, transcriptText: e.target.value }))}
                  placeholder="Paste your Fathom transcript here to get AI coaching feedback. Needs at least 100 words. From Fathom: open the call, click Share, choose Copy Transcript."
                  rows={isMobile ? 6 : 7}
                  style={{
                    ...inputStyle,
                    minHeight: 140, fontFamily: 'inherit',
                    resize: 'vertical',
                    lineHeight: 1.5,
                  }}
                />
                {form.transcriptText.trim().length > 0 && (
                  <div style={{ fontSize: 10, color: '#6B8299', marginTop: 4 }}>
                    {form.transcriptText.trim().split(/\s+/).length} words, Claude will review this after you save.
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                borderTop: '1px dashed rgba(201,169,110,0.15)', paddingTop: 14, marginTop: 4,
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '14px 16px',
                background: 'rgba(201,169,110,0.04)',
                border: '1px solid rgba(201,169,110,0.18)',
                borderRadius: 6,
              }}>
                <span style={{ color: '#C9A96E', fontSize: 16, lineHeight: 1, marginTop: 1 }}>🔒</span>
                <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.55 }}>
                  <div style={{ color: '#fff', fontWeight: 600, marginBottom: 3 }}>
                    Transcript analysis unlocks at CFT
                  </div>
                  Earn your CFT certification to get JLM-style coaching on every call you paste, graded against the AFF script for the call type you select. You can still log this call now.
                </div>
              </div>
            )}

            {error && (
              <div style={{ fontSize: 11, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 4, border: '1px solid rgba(248,113,113,0.2)' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column-reverse' : 'row', paddingTop: 4 }}>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={submitting}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#9BB0C4', borderRadius: 4,
                  padding: '12px 18px', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  cursor: submitting ? 'wait' : 'pointer',
                  minHeight: 44, flex: isMobile ? undefined : 'none',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  background: submitting ? 'rgba(201,169,110,0.5)' : '#C9A96E',
                  color: '#142D48', border: 'none', borderRadius: 4,
                  padding: '12px 20px', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  cursor: submitting ? 'wait' : 'pointer',
                  minHeight: 44, flex: 1,
                }}
              >
                {submitting ? 'Saving...' : (form.transcriptText.trim() ? 'Save & Analyze' : 'Save Call')}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div style={{ color: '#6B8299', fontSize: 13 }}>Loading...</div>
        ) : calls.length === 0 ? (
          <div style={{
            position: 'relative',
            padding: 'clamp(32px, 6vw, 56px) clamp(20px, 4vw, 32px)',
            borderRadius: 8,
            overflow: 'hidden',
            backgroundImage: "linear-gradient(135deg, rgba(10,22,40,0.85) 0%, rgba(19,34,56,0.7) 100%), url('/brand/phone-marble.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: '1px solid rgba(201,169,110,0.15)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 8 }}>
              Ready when you are
            </div>
            <div style={{ fontSize: 'clamp(16px, 3vw, 18px)', color: '#ffffff', fontWeight: 500, marginBottom: 6, textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>
              Your coaching history starts here
            </div>
            <div style={{ fontSize: 12, color: '#9BB0C4', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>
              Paste a Fathom transcript into <strong style={{ color: '#C9A96E' }}>+ Log Call</strong> and Claude will give you concrete coaching tips in about 10 seconds — tailored to what actually happened on your call.
            </div>
          </div>
        ) : isMobile ? (
          // Mobile: stacked cards
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {calls.map(c => <CallRowMobile key={c.id} call={c} analyzing={analyzingCallIds.has(c.id)} onViewReview={() => openReview(c)} />)}
          </div>
        ) : (
          // Desktop: table
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['Date', 'Contact', 'Subject', 'Call Type', 'Outcome', 'AI Review'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {calls.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{new Date(c.callDate).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#ffffff' }}>{c.contactName}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{c.subject ?? '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#9BB0C4' }}>{formatCallType(c) ?? c.result ?? '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {c.outcome && OUTCOME_LABEL[c.outcome] ? (
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          color: POSITIVE_OUTCOMES.has(c.outcome) ? '#4ade80' : '#9BB0C4',
                          padding: '3px 8px', borderRadius: 3,
                          background: POSITIVE_OUTCOMES.has(c.outcome) ? 'rgba(74,222,128,0.1)' : 'rgba(107,130,153,0.12)',
                          border: `1px solid ${POSITIVE_OUTCOMES.has(c.outcome) ? 'rgba(74,222,128,0.25)' : 'rgba(107,130,153,0.25)'}`,
                          display: 'inline-block',
                        }}>
                          {OUTCOME_LABEL[c.outcome]}
                        </span>
                      ) : (
                        <span style={{ color: '#4B5563', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <ReviewCell call={c} analyzing={analyzingCallIds.has(c.id)} onClick={() => openReview(c)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewingReview && (
        <CallReviewModal
          review={viewingReview.review}
          callDate={viewingReview.call.callDate}
          contactName={viewingReview.call.contactName}
          outcome={viewingReview.call.outcome}
          scriptName={viewingReview.scriptName}
          scriptResourceUrl={viewingReview.scriptResourceUrl}
          onClose={() => setViewingReview(null)}
        />
      )}
    </>
  )
}

function ReviewCell({ call, analyzing, onClick }: { call: CallLogRow; analyzing: boolean; onClick: () => void }) {
  if (analyzing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#C9A96E', fontStyle: 'italic' }}>
        <Spinner size={12} />
        Analyzing...
      </span>
    )
  }
  if (!call.review) {
    return <span style={{ fontSize: 11, color: '#4B5563' }}>—</span>
  }
  const color = call.review.overallScore >= 80 ? '#4ade80' : call.review.overallScore >= 60 ? '#f59e0b' : '#f87171'
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: `1px solid ${color}40`,
        borderRadius: 4,
        padding: '4px 10px',
        fontSize: 11, fontWeight: 700,
        color,
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        minHeight: 28,
      }}
    >
      {call.review.overallScore}
      {call.review.flaggedForCoaching && <span>⚑</span>}
      <span style={{ opacity: 0.7, fontSize: 9 }}>VIEW</span>
    </button>
  )
}

function CallRowMobile({ call, analyzing, onViewReview }: { call: CallLogRow; analyzing: boolean; onViewReview: () => void }) {
  const scoreColor = call.review
    ? call.review.overallScore >= 80 ? '#4ade80' : call.review.overallScore >= 60 ? '#f59e0b' : '#f87171'
    : '#4B5563'
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(201,169,110,0.08)',
      borderRadius: 6,
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#ffffff', marginBottom: 2 }}>{call.contactName}</div>
          <div style={{ fontSize: 10, color: '#6B8299' }}>
            {new Date(call.callDate).toLocaleDateString()} {call.subject ? `· ${call.subject}` : ''}
          </div>
          {(formatCallType(call) || call.result) && (
            <div style={{ fontSize: 11, color: '#9BB0C4', marginTop: 6 }}>{formatCallType(call) ?? call.result}</div>
          )}
        </div>
        {analyzing ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 10, color: '#C9A96E', fontStyle: 'italic', flexShrink: 0,
          }}>
            <Spinner size={11} />
            Analyzing...
          </div>
        ) : call.review ? (
          <button
            onClick={onViewReview}
            style={{
              background: `${scoreColor}12`,
              border: `1px solid ${scoreColor}50`,
              borderRadius: 4,
              padding: '8px 10px',
              fontSize: 12, fontWeight: 700,
              color: scoreColor,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              minHeight: 40, minWidth: 56,
              flexShrink: 0,
            }}
          >
            {call.review.overallScore}
            {call.review.flaggedForCoaching && <span style={{ fontSize: 10 }}>⚑</span>}
          </button>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {call.outcome && OUTCOME_LABEL[call.outcome] && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: POSITIVE_OUTCOMES.has(call.outcome) ? '#4ade80' : '#9BB0C4',
            padding: '3px 8px', borderRadius: 3,
            background: POSITIVE_OUTCOMES.has(call.outcome) ? 'rgba(74,222,128,0.1)' : 'rgba(107,130,153,0.12)',
            border: `1px solid ${POSITIVE_OUTCOMES.has(call.outcome) ? 'rgba(74,222,128,0.25)' : 'rgba(107,130,153,0.25)'}`,
          }}>
            {OUTCOME_LABEL[call.outcome]}
          </span>
        )}
        {call.followUpNeeded && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#f59e0b',
            padding: '3px 8px', borderRadius: 3,
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
          }}>
            Follow-up needed
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Training Resources Tab ────────────────────────────────────────────────────

const RESOURCE_GROUPS: { key: string; label: string; icon: string }[] = [
  { key: 'videos', label: 'Training Videos', icon: '▶' },
  { key: 'books', label: 'Book List', icon: '◈' },
  { key: 'training', label: 'Training & Company', icon: '◎' },
  { key: 'tools', label: 'Tools & Apps', icon: '⚙' },
  { key: 'scripts', label: 'Scripts', icon: '◑' },
  { key: 'forms', label: 'Forms & Providers', icon: '◫' },
  { key: 'general', label: 'General', icon: '◉' },
]

// ─── My Team Tab ──────────────────────────────────────────────────────────────

type MemberStatus = 'ACTIVE' | 'INVITED' | 'PENDING' | 'INACTIVE'

interface TeamProgress {
  phase: number
  daysInPhase: number | null
  currentPhaseCompleted: number
  currentPhaseTotal: number
  perPhase: Array<{ phase: number; completed: number; total: number }>
  currentPhaseChecklist: Array<{ key: string; label: string; completed: boolean }>
  lastActivityAt: string | null
}

interface TeamNode {
  id: string
  agentUserId: string | null
  referralId: string | null
  agentCode: string
  firstName: string
  lastName: string
  preferredName: string | null
  phase: number
  title: string
  state: string | null
  avatarUrl: string | null
  memberStatus: MemberStatus
  progress: TeamProgress | null
  pfrStatus: 'not_started' | 'in_progress' | 'completed' | null
  inviteEmail: string | null
  inviteSentAt: string | null
  inviteExpiresAt: string | null
  children: TeamNode[]
}

const MEMBER_STATUS_STYLE: Record<MemberStatus, { bg: string; border: string; fg: string; label: string }> = {
  ACTIVE:   { bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.30)',  fg: '#4ADE80', label: 'Active' },
  INVITED:  { bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.30)',  fg: '#60A5FA', label: 'Invited' },
  PENDING:  { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.30)',  fg: '#F59E0B', label: 'Pending Review' },
  INACTIVE: { bg: 'rgba(107,130,153,0.10)', border: 'rgba(107,130,153,0.25)', fg: '#9BB0C4', label: 'Inactive' },
}

const TEAM_PHASE_COLORS = PHASE_COLORS

// ─── Tab strip with scroll affordance ──────────────────────────────────────
//
// Drop-in replacement for the original overflow-x scroll container. Adds:
//   - left/right gradient fades that appear only when there's more to
//     see in that direction, so the strip visually "leaks" off-screen
//     instead of looking like a clean edge
//   - chevron tap targets that scroll the strip by ~60% of its width;
//     fades and chevrons hide together at each end so the affordance
//     disappears when there's nothing more to scroll to
//   - auto-scroll the active tab into the center of the viewport when
//     activeTab changes from any external trigger (mobile drawer link,
//     checklist deep-link, etc.), so the agent never has to manually
//     find the tab they just clicked
//
// `licensingBadge` is the count of incomplete licensing checklist items;
// passed in so the LICENSING tab can keep its small orange badge.

interface TabStripTab { key: string; label: string }

function TabStrip({
  tabs, activeTab, onSelect, licensingBadge,
}: {
  tabs: ReadonlyArray<TabStripTab>
  activeTab: string
  onSelect: (key: string) => void
  licensingBadge: number
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    // 1px slack so a fractional scroll position doesn't leave a fade
    // visible when we're effectively at the edge.
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  // Recompute on mount + when the tab list changes (e.g. the My
  // Trainees tab appearing once we know the agent is a trainer).
  useEffect(() => {
    updateScrollState()
  }, [updateScrollState, tabs.length])

  // Window resize can change clientWidth without firing scroll, so
  // recompute on resize too.
  useEffect(() => {
    const handler = () => updateScrollState()
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [updateScrollState])

  // Auto-scroll the active tab into view, centered. Uses inline:
  // 'center' so on small screens the active tab sits in the middle
  // of the strip with room on both sides — gives a clearer "you can
  // scroll either way" affordance than aligning to the edge.
  useEffect(() => {
    const btn = buttonRefs.current[activeTab]
    if (!btn) return
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    // scrollIntoView fires async; recompute fade state after the
    // browser settles the new scrollLeft.
    const t = window.setTimeout(updateScrollState, 350)
    return () => window.clearTimeout(t)
  }, [activeTab, updateScrollState])

  const scrollBy = (delta: number) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: delta, behavior: 'smooth' })
    window.setTimeout(updateScrollState, 350)
  }

  return (
    <div style={{ position: 'relative', marginBottom: 20 }}>
      <div
        id="agent-tab-nav"
        ref={scrollerRef}
        onScroll={updateScrollState}
        style={{
          display: 'flex', gap: 0,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          overflowX: 'auto', scrollMarginTop: 80,
          // Hide the native scrollbar across browsers. The fades + chevrons
          // are the affordance; a chrome scrollbar on top of them is noise.
          scrollbarWidth: 'none' as const,
          msOverflowStyle: 'none' as const,
        }}
      >
        {tabs.map(tab => (
          <button
            key={tab.key}
            ref={el => { buttonRefs.current[tab.key] = el }}
            onClick={() => onSelect(tab.key)}
            style={{
              background: 'none', border: 'none', whiteSpace: 'nowrap',
              padding: '8px 14px', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: activeTab === tab.key ? '#C9A96E' : '#6B8299',
              borderBottom: activeTab === tab.key ? '2px solid #C9A96E' : '2px solid transparent',
              marginBottom: -1,
              ...(tab.key === 'licensing' && { position: 'relative' }),
            }}
          >
            {tab.label}
            {tab.key === 'licensing' && licensingBadge > 0 && (
              <span style={{
                marginLeft: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 14, height: 14, borderRadius: '50%', fontSize: 8, fontWeight: 700,
                background: '#f59e0b', color: '#0A1628',
              }}>
                {licensingBadge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Left edge affordance */}
      {canScrollLeft && (
        <>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 1, width: 40,
            background: 'linear-gradient(to right, #0A1628, rgba(10,22,40,0))',
            pointerEvents: 'none',
          }} />
          <button
            type="button"
            onClick={() => scrollBy(-Math.max(150, (scrollerRef.current?.clientWidth ?? 300) * 0.6))}
            aria-label="Scroll tabs left"
            style={{
              position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
              width: 28, height: 28, borderRadius: '50%',
              background: '#132238', border: '1px solid rgba(201,169,110,0.25)',
              color: '#C9A96E', fontSize: 14, fontWeight: 700, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            ‹
          </button>
        </>
      )}

      {/* Right edge affordance */}
      {canScrollRight && (
        <>
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 1, width: 40,
            background: 'linear-gradient(to left, #0A1628, rgba(10,22,40,0))',
            pointerEvents: 'none',
          }} />
          <button
            type="button"
            onClick={() => scrollBy(Math.max(150, (scrollerRef.current?.clientWidth ?? 300) * 0.6))}
            aria-label="Scroll tabs right"
            style={{
              position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
              width: 28, height: 28, borderRadius: '50%',
              background: '#132238', border: '1px solid rgba(201,169,110,0.25)',
              color: '#C9A96E', fontSize: 14, fontWeight: 700, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            ›
          </button>
        </>
      )}

      {/* WebKit scrollbar suppression — Firefox + Edge handled by the
          inline `scrollbarWidth: 'none'`, but Safari/Chrome need this. */}
      <style jsx>{`
        #agent-tab-nav::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}

// Top-nav link styled to read as a real navigation item rather than
function NavbarLink({ href, Icon, label }: {
  href: string; Icon: LucideIcon; label: string
}) {
  // Preserve ?preview=<token> across navigation so admin "view portal
  // as X" doesn't lose the preview identity when clicking into
  // Leaderboard / Directory / Trainings / etc. Without this, those
  // pages fall back to the admin's own session and the agent-side API
  // routes 401 because the admin's auth cookie is scoped to /vault.
  const search = typeof window !== 'undefined' ? window.location.search : ''
  const params = new URLSearchParams(search)
  const previewToken = params.get('preview')
  const finalHref = previewToken && !href.includes('?')
    ? `${href}?preview=${encodeURIComponent(previewToken)}`
    : href

  return (
    <a
      href={finalHref}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '6px 10px', borderRadius: 4,
        fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
        color: '#C9A96E', textDecoration: 'none',
        border: '1px solid rgba(201,169,110,0.18)',
        background: 'rgba(201,169,110,0.04)',
        whiteSpace: 'nowrap', lineHeight: 1,
      }}
    >
      <Icon size={13} color="#C9A96E" />
      <span>{label}</span>
    </a>
  )
}

function formatRelativeDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function ProgressStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B8299', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color }}>{value}</div>
    </div>
  )
}

function TeamMemberNode({ node, depth, isMobile, onOpenCard, previewToken }: { node: TeamNode; depth: number; isMobile: boolean; onOpenCard: (code: string) => void; previewToken?: string | null }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const [showProgress, setShowProgress] = useState(false)
  // Separate toggle for Business Partners + FTA drill-down. Lazy-loaded
  // so the team tree stays cheap when nobody opens contacts. Backed
  // by the same /api/agents/trainees/[code]/* endpoints, which authorize
  // on either recruiter OR cft-trainer match.
  const [showContacts, setShowContacts] = useState(false)
  const [showPfr, setShowPfr] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [reminding, setReminding] = useState(false)
  const [remindMsg, setRemindMsg] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState<string | null>(null)
  const color = TEAM_PHASE_COLORS[node.phase] ?? '#C9A96E'
  const statusStyle = MEMBER_STATUS_STYLE[node.memberStatus]
  const isInactive = node.memberStatus !== 'ACTIVE'
  // INACTIVE is faded harder than INVITED/PENDING because the agent
  // toggled their full team on specifically to see this — but the
  // person is no longer producing, so they shouldn't compete with
  // active recruits for visual attention.
  const inactiveOpacity = node.memberStatus === 'INACTIVE' ? 0.55 : (isInactive ? 0.85 : 1)
  let descendants = 0
  function count(n: TeamNode) { for (const c of n.children) { descendants++; count(c) } }
  count(node)

  const lastActivityLabel = node.progress?.lastActivityAt
    ? formatRelativeDays(node.progress.lastActivityAt)
    : null
  // Stalled = no activity in 14+ days while in an active phase. Useful
  // visual cue for an upline scanning a long roster for who needs a nudge.
  const stalled = node.progress?.lastActivityAt
    ? (Date.now() - new Date(node.progress.lastActivityAt).getTime()) / 86_400_000 > 14
    : false

  const handleResend = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!node.agentUserId || resending) return
    setResending(true)
    setResendMsg(null)
    try {
      const res = await fetch('/api/agents/team/resend-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentUserId: node.agentUserId }),
      })
      const d = await res.json().catch(() => ({})) as { ok?: boolean; emailError?: string }
      setResendMsg(d.ok ? 'Sent ✓' : (d.emailError ?? 'Failed'))
      setTimeout(() => setResendMsg(null), 3000)
    } finally {
      setResending(false)
    }
  }

  const handleRemindPfr = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!node.agentCode || reminding) return
    setReminding(true)
    setRemindMsg(null)
    try {
      const url = previewToken
        ? `/api/agents/trainees/${node.agentCode}/pfr-reminder?preview=${encodeURIComponent(previewToken)}`
        : `/api/agents/trainees/${node.agentCode}/pfr-reminder`
      const res = await fetch(url, { method: 'POST' })
      const d = await res.json().catch(() => ({})) as { ok?: boolean; alreadyDone?: boolean }
      setRemindMsg(res.ok ? (d.alreadyDone ? 'Already done' : 'Reminder sent ✓') : 'Failed')
    } catch {
      setRemindMsg('Failed')
    } finally {
      setReminding(false)
      setTimeout(() => setRemindMsg(null), 3500)
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px',
          background: '#132238',
          border: `1px solid ${isInactive ? statusStyle.border : `${color}25`}`,
          borderRadius: 8,
          marginLeft: isMobile ? depth * 16 : depth * 32,
          cursor: node.children.length > 0 ? 'pointer' : 'default',
          opacity: inactiveOpacity,
        }}
        onClick={() => node.children.length > 0 && setExpanded(!expanded)}
      >
        <div
          onClick={e => { e.stopPropagation(); onOpenCard(node.agentCode) }}
          title="Open trading card"
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: node.avatarUrl ? `url(${node.avatarUrl}) center/cover` : `${color}20`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color, flexShrink: 0,
            border: `2px solid ${isInactive ? statusStyle.border : `${color}35`}`,
            cursor: 'pointer',
          }}
        >
          {!node.avatarUrl && `${node.firstName?.[0] ?? ''}${node.lastName?.[0] ?? ''}`.toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            onClick={e => { e.stopPropagation(); onOpenCard(node.agentCode) }}
            title="Open trading card"
            style={{ fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'inline-block' }}
          >
            {displayFullName(node)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              padding: '2px 6px', borderRadius: 3,
              background: statusStyle.bg, border: `1px solid ${statusStyle.border}`, color: statusStyle.fg,
            }}>
              {statusStyle.label}
            </span>
            {node.memberStatus === 'ACTIVE' && (
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '2px 6px', borderRadius: 3,
                background: `${color}15`, border: `1px solid ${color}30`, color,
              }}>
                {node.title}
              </span>
            )}
            {node.state && <span style={{ fontSize: 9, color: '#6B8299' }}>{node.state}</span>}
            {/* Inline progress summary for ACTIVE members. Lets the upline */}
            {/* scan a long team and spot stalled agents at a glance. */}
            {node.progress && (
              <>
                <span style={{ fontSize: 9, color: '#6B8299' }}>
                  P{node.progress.phase} · {node.progress.currentPhaseCompleted}/{node.progress.currentPhaseTotal}
                </span>
                {lastActivityLabel && (
                  <span style={{ fontSize: 9, color: stalled ? '#f59e0b' : '#6B8299', fontWeight: stalled ? 700 : 400 }}>
                    {stalled ? '⚠ ' : ''}Active {lastActivityLabel}
                  </span>
                )}
              </>
            )}
            {node.memberStatus === 'ACTIVE' && node.pfrStatus && (() => {
              const s = {
                completed:   { bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.30)',  fg: '#4ADE80', label: 'PFR ✓' },
                in_progress: { bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.30)',  fg: '#60A5FA', label: 'PFR · in progress' },
                not_started: { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)',  fg: '#F59E0B', label: 'PFR not started' },
              }[node.pfrStatus]
              return (
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  padding: '2px 6px', borderRadius: 3,
                  background: s.bg, border: `1px solid ${s.border}`, color: s.fg,
                }}>
                  {s.label}
                </span>
              )
            })()}
          </div>
        </div>
        {node.memberStatus === 'INVITED' && node.agentUserId && (
          <button
            onClick={handleResend}
            disabled={resending}
            style={{
              padding: '5px 10px', borderRadius: 4,
              background: 'transparent', border: '1px solid rgba(96,165,250,0.4)',
              color: '#60A5FA', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: resending ? 'wait' : 'pointer', flexShrink: 0,
            }}
          >
            {resending ? 'Sending...' : (resendMsg ?? 'Resend invite')}
          </button>
        )}
        {node.memberStatus === 'PENDING' && (
          <span style={{ fontSize: 9, color: '#6B8299', fontStyle: 'italic', flexShrink: 0 }}>
            Awaiting admin approval
          </span>
        )}
        {/* Details toggle. Always available so the upline can see SOMETHING */}
        {/* useful regardless of member status: progress for ACTIVE, invite */}
        {/* status for INVITED, referral status for PENDING. Stops click */}
        {/* propagation so it doesn't also collapse/expand the children. */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowProgress(s => !s) }}
          style={{
            padding: '4px 10px', borderRadius: 4,
            background: showProgress ? `${color}20` : 'transparent',
            border: `1px solid ${color}40`, color,
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          {showProgress ? 'Hide' : 'View'} {node.memberStatus === 'ACTIVE' ? 'progress' : 'details'}
        </button>
        {/* Contacts toggle. Only meaningful for ACTIVE members — an
            INVITED / PENDING agent has no profile to fetch from. The
            endpoint auth allows both recruiter and trainer drill-in,
            so a recruiter can review what their downline is working on. */}
        {node.memberStatus === 'ACTIVE' && node.agentCode && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowContacts(s => !s) }}
            style={{
              padding: '4px 10px', borderRadius: 4,
              background: showContacts ? 'rgba(201,169,110,0.18)' : 'transparent',
              border: '1px solid rgba(201,169,110,0.35)', color: '#C9A96E',
              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            {showContacts ? 'Hide' : 'View'} contacts
          </button>
        )}
        {/* PFR. When not started there's deliberately no "View" button
            (nothing to show) — just the status above + a one-tap Discord
            reminder. Once started/done, a read-only drill-in. */}
        {node.memberStatus === 'ACTIVE' && node.agentCode && node.pfrStatus === 'not_started' && (
          <button
            onClick={handleRemindPfr}
            disabled={reminding}
            style={{
              padding: '4px 10px', borderRadius: 4,
              background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.40)',
              color: '#F59E0B', fontSize: 9, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: reminding ? 'wait' : 'pointer', flexShrink: 0,
            }}
          >
            {reminding ? 'Sending...' : (remindMsg ?? 'Remind: PFR')}
          </button>
        )}
        {node.memberStatus === 'ACTIVE' && node.agentCode && node.pfrStatus && node.pfrStatus !== 'not_started' && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowPfr(s => !s) }}
            style={{
              padding: '4px 10px', borderRadius: 4,
              background: showPfr ? 'rgba(52,211,153,0.18)' : 'transparent',
              border: '1px solid rgba(52,211,153,0.35)', color: '#34D399',
              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            {showPfr ? 'Hide' : 'View'} PFR
          </button>
        )}
        {node.memberStatus === 'ACTIVE' && node.agentCode && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowNotes(s => !s) }}
            style={{
              padding: '4px 10px', borderRadius: 4,
              background: showNotes ? 'rgba(155,109,255,0.18)' : 'transparent',
              border: '1px solid rgba(155,109,255,0.35)', color: '#9B6DFF',
              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            {showNotes ? 'Hide' : 'View'} notes
          </button>
        )}
        {node.children.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 9, color: '#6B8299', fontWeight: 600 }}>{descendants}</span>
            <span style={{ fontSize: 10, color: '#6B8299', transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
          </div>
        )}
      </div>
      {/* INVITED detail panel: invite email + sent date + expiration. */}
      {/* Mirrors the layout of the active progress panel so the upline */}
      {/* always gets a useful expansion regardless of who they click. */}
      {showProgress && node.memberStatus === 'INVITED' && (
        <div style={{
          marginLeft: isMobile ? depth * 16 + 14 : depth * 32 + 14,
          marginTop: 6,
          padding: '12px 14px',
          background: 'rgba(96,165,250,0.04)',
          border: '1px solid rgba(96,165,250,0.15)',
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#60A5FA', marginBottom: 6 }}>
            Hasn&apos;t activated yet
          </div>
          <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.6 }}>
            {`${displayFirstName(node)} hasn't set their password yet. If they didn't get the welcome email (or never received one), tap Resend invite to send it now.`}
            {node.inviteEmail && <><br /><strong style={{ color: '#fff' }}>Email:</strong> {node.inviteEmail}</>}
            {node.inviteSentAt && <><br /><strong style={{ color: '#fff' }}>Approved:</strong> {new Date(node.inviteSentAt).toLocaleDateString()}</>}
            {node.inviteExpiresAt && (
              <><br /><strong style={{ color: '#fff' }}>Invite link expires:</strong> {new Date(node.inviteExpiresAt).toLocaleString()}{new Date(node.inviteExpiresAt).getTime() < Date.now() ? ' (expired)' : ''}</>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: '#4B5563', fontStyle: 'italic' }}>
            Tap &quot;Resend invite&quot; on the row above to send (or re-send) the welcome email.
          </div>
        </div>
      )}
      {/* PENDING detail panel: just confirms what's happening. */}
      {showProgress && node.memberStatus === 'PENDING' && (
        <div style={{
          marginLeft: isMobile ? depth * 16 + 14 : depth * 32 + 14,
          marginTop: 6,
          padding: '12px 14px',
          background: 'rgba(245,158,11,0.04)',
          border: '1px solid rgba(245,158,11,0.15)',
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginBottom: 6 }}>
            Awaiting admin approval
          </div>
          <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.6 }}>
            You referred {displayFullName(node)} on {node.inviteSentAt ? new Date(node.inviteSentAt).toLocaleDateString() : 'recently'}.
            An admin or licensing coordinator will review the referral and send the welcome email.
          </div>
        </div>
      )}
      {showProgress && node.progress && (
        <div style={{
          marginLeft: isMobile ? depth * 16 + 14 : depth * 32 + 14,
          marginTop: 6,
          padding: '12px 14px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 6,
        }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <ProgressStat label="Current Phase" value={`Phase ${node.progress.phase}`} color={color} />
            <ProgressStat label="Days in Phase" value={node.progress.daysInPhase != null ? `${node.progress.daysInPhase}d` : '—'} color="#9BB0C4" />
            <ProgressStat
              label="Phase Progress"
              value={`${node.progress.currentPhaseCompleted}/${node.progress.currentPhaseTotal}`}
              color="#C9A96E"
            />
            <ProgressStat
              label="Last Activity"
              value={lastActivityLabel ?? 'Never'}
              color={stalled ? '#f59e0b' : '#9BB0C4'}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {node.progress.perPhase.map(p => {
              const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0
              const phaseColor = TEAM_PHASE_COLORS[p.phase] ?? '#C9A96E'
              const isCurrent = p.phase === node.progress!.phase
              return (
                <div key={p.phase} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: isCurrent ? phaseColor : '#6B8299', width: 56, flexShrink: 0 }}>
                    PHASE {p.phase}
                  </span>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: phaseColor, transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 10, color: '#6B8299', fontWeight: 600, width: 48, textAlign: 'right', flexShrink: 0 }}>
                    {p.completed}/{p.total}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Per-item checklist for the current phase. Lets the upline */}
          {/* see exactly which steps are done vs outstanding so they */}
          {/* can DM with targeted help on the items still pending. */}
          {node.progress.currentPhaseChecklist.length > 0 && (() => {
            const phaseColor = TEAM_PHASE_COLORS[node.progress!.phase] ?? '#C9A96E'
            const pending = node.progress!.currentPhaseChecklist.filter(c => !c.completed)
            return (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E' }}>
                    Phase {node.progress!.phase} Checklist
                  </span>
                  <span style={{ fontSize: 9, color: '#6B8299' }}>
                    {pending.length === 0 ? 'all done' : `${pending.length} remaining`}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {node.progress!.currentPhaseChecklist.map(item => (
                    <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, lineHeight: 1.4 }}>
                      <span style={{
                        width: 14, height: 14, flexShrink: 0,
                        borderRadius: 3,
                        border: `1px solid ${item.completed ? phaseColor : 'rgba(255,255,255,0.18)'}`,
                        background: item.completed ? phaseColor : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 900, color: '#0A1628',
                      }}>
                        {item.completed ? '✓' : ''}
                      </span>
                      <span style={{
                        color: item.completed ? '#4B5563' : '#9BB0C4',
                        textDecoration: item.completed ? 'line-through' : 'none',
                      }}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          <div style={{ marginTop: 10, fontSize: 10, color: '#4B5563', fontStyle: 'italic' }}>
            Read-only view. Reach out to {node.firstName} on Discord if they&apos;re stuck on a step.
          </div>
        </div>
      )}
      {expanded && node.children.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
          {node.children.map(c => (
            <TeamMemberNode key={c.id} node={c} depth={depth + 1} isMobile={isMobile} onOpenCard={onOpenCard} previewToken={previewToken} />
          ))}
        </div>
      )}
      {showContacts && node.agentCode && (
        <div style={{
          marginLeft: isMobile ? depth * 16 + 14 : depth * 32 + 14,
          marginTop: 6,
          padding: '12px 14px',
          background: 'rgba(201,169,110,0.04)',
          border: '1px solid rgba(201,169,110,0.15)',
          borderRadius: 6,
        }}>
          <ContactsDrilldown
            agentCode={node.agentCode}
            agentFirstName={node.firstName}
            previewToken={previewToken}
          />
        </div>
      )}
      {showPfr && node.agentCode && (
        <div style={{
          marginLeft: isMobile ? depth * 16 + 14 : depth * 32 + 14,
          marginTop: 6,
          padding: '12px 14px',
          background: 'rgba(96,165,250,0.04)',
          border: '1px solid rgba(96,165,250,0.15)',
          borderRadius: 6,
        }}>
          <PfrReadOnly agentCode={node.agentCode} agentFirstName={node.firstName} previewToken={previewToken} />
        </div>
      )}
      {showNotes && node.agentCode && (
        <div style={{
          marginLeft: isMobile ? depth * 16 + 14 : depth * 32 + 14,
          marginTop: 6,
          padding: '12px 14px',
          background: 'rgba(155,109,255,0.04)',
          border: '1px solid rgba(155,109,255,0.15)',
          borderRadius: 6,
        }}>
          <AgentNotesPanel
            agentCode={node.agentCode}
            agentFirstName={node.firstName}
            previewToken={previewToken}
          />
        </div>
      )}
    </div>
  )
}

// ─── My Trainees Tab ───────────────────────────────────────────────────────
//
// Shown only when traineeCount > 0 (other agents have this profile's
// name in their cft field). Lists each trainee with a phase badge +
// counts; clicking a row expands a read-only panel showing that
// trainee's Business Partner list and FTA contacts. Mercedes (D2161)
// asked for this so she could review what her trainees were doing in
// the field without needing to ask them to share.
//
// All three fetches go through /api/agents/trainees... which scopes
// on the server by normalized cft match, so we never need to pass
// the trainer's name from the client.

interface TraineeRow {
  id: string
  agentCode: string
  firstName: string
  lastName: string
  preferredName: string | null
  avatarUrl: string | null
  phase: number
  phaseStartedAt: string | null
  state: string | null
  status: string
  partnerCount: number
  ftaCount: number
}

interface TraineePartner {
  id: string
  name: string
  email: string | null
  phone: string | null
  timeZone: string | null
  age: string | null
  married: boolean
  children: boolean
  homeowner: boolean
  occupation: string | null
  characterTraits: string | null
  category: string | null
  status: string | null
  appointmentDate: string | null
  firstCallDate: string | null
  secondCallDate: string | null
  bookedAppt: boolean
  notes: string | null
  trainerNotes: string | null
  lastContactAt: string | null
  createdAt: string
}

interface TraineeFta {
  id: string
  appointmentDate: string
  status: string
  notes: string | null
  businessPartner?: { id: string; name: string; phone: string | null; email: string | null; occupation: string | null; category: string | null } | null
}

// ContactsDrilldown — shared component used by MyTeamTab in two
// places: inside each recruited TeamMemberNode (so a recruiter can
// drill into anyone they brought on) and in the "Also training"
// flat section (so a trainer can drill into anyone they're assigned
// to but didn't recruit). Hits the unified team-member-access
// endpoints which authorize on either recruiter OR trainer match.
function ContactsDrilldown({ agentCode, agentFirstName, previewToken }: {
  agentCode: string; agentFirstName: string; previewToken?: string | null
}) {
  const [data, setData] = useState<{ partners: TraineePartner[]; ftas: TraineeFta[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const withPreview = (url: string) => previewToken
    ? url + (url.includes('?') ? '&' : '?') + `preview=${encodeURIComponent(previewToken)}`
    : url

  useEffect(() => {
    setLoading(true); setError(null)
    Promise.all([
      fetch(withPreview(`/api/agents/trainees/${agentCode}/partners`)),
      fetch(withPreview(`/api/agents/trainees/${agentCode}/fta`)),
    ])
      .then(async ([pRes, fRes]) => {
        if (!pRes.ok || !fRes.ok) {
          setError("You don't have access to this agent's contacts.")
          return
        }
        const pd = await pRes.json() as { partners?: TraineePartner[] }
        const fd = await fRes.json() as { ftas?: TraineeFta[] }
        setData({ partners: pd.partners ?? [], ftas: fd.ftas ?? [] })
      })
      .catch(() => setError('Failed to load contacts.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentCode, previewToken])

  if (loading) return <div style={{ color: '#6B8299', fontSize: 11, padding: 8 }}>Loading {agentFirstName}&apos;s contacts...</div>
  if (error) return <div style={{ color: '#f87171', fontSize: 11, padding: 8 }}>{error}</div>
  if (!data) return null
  return (
    <>
      <DrillSection title="Business Partners">
        {data.partners.length === 0
          ? <div style={{ color: '#4B5563', fontSize: 11, padding: 8 }}>No business partners on file yet.</div>
          : data.partners.map(p => <PartnerRow key={p.id} p={p} agentCode={agentCode} previewToken={previewToken} />)}
      </DrillSection>
      <DrillSection title="Field Training Appointments">
        {data.ftas.length === 0
          ? <div style={{ color: '#4B5563', fontSize: 11, padding: 8 }}>No FTAs logged yet.</div>
          : data.ftas.map(f => <FtaRow key={f.id} f={f} />)}
      </DrillSection>
    </>
  )
}

interface AgentNoteItem {
  id: string
  body: string
  authorType: 'AGENT' | 'ADMIN'
  author: string
  createdAt: string
}

// Historical leadership-notes thread on an agent. Visible to the
// upline / trainer / admins, never to the agent themselves (the API
// enforces that). Mirrors the policy NewBusinessNote thread UX.
function AgentNotesPanel({ agentCode, agentFirstName, previewToken }: {
  agentCode: string; agentFirstName: string; previewToken?: string | null
}) {
  const [notes, setNotes] = useState<AgentNoteItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const withPreview = (url: string) => previewToken
    ? url + (url.includes('?') ? '&' : '?') + `preview=${encodeURIComponent(previewToken)}`
    : url

  useEffect(() => {
    setError(null)
    fetch(withPreview(`/api/agents/trainees/${agentCode}/notes`))
      .then(async res => {
        if (!res.ok) { setError("You don't have access to this agent's notes."); return }
        const d = await res.json() as { notes?: AgentNoteItem[] }
        setNotes(d.notes ?? [])
      })
      .catch(() => setError('Failed to load notes.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentCode, previewToken])

  const submit = async () => {
    const body = draft.trim()
    if (!body || saving) return
    setSaving(true)
    try {
      const res = await fetch(withPreview(`/api/agents/trainees/${agentCode}/notes`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (res.ok) {
        const d = await res.json() as { note: AgentNoteItem }
        setNotes(prev => [d.note, ...(prev ?? [])])
        setDraft('')
      } else {
        setError('Could not save the note.')
      }
    } catch {
      setError('Could not save the note.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9B6DFF', marginBottom: 4 }}>
        Notes &amp; History
      </div>
      <div style={{ fontSize: 10, color: '#6B8299', marginBottom: 10, lineHeight: 1.5 }}>
        Shared across {agentFirstName}&apos;s upline, trainer and AFF leadership. {agentFirstName} cannot see these.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Add a note..."
          rows={2}
          style={{
            width: '100%', resize: 'vertical',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(155,109,255,0.25)',
            borderRadius: 4, color: '#fff', fontSize: 12, padding: '8px 10px',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={submit}
          disabled={saving || !draft.trim()}
          style={{
            alignSelf: 'flex-end', padding: '5px 14px', borderRadius: 4,
            background: draft.trim() ? 'rgba(155,109,255,0.18)' : 'transparent',
            border: '1px solid rgba(155,109,255,0.40)', color: '#9B6DFF',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: saving || !draft.trim() ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : '+ Add note'}
        </button>
      </div>
      {error && <div style={{ color: '#f87171', fontSize: 11, padding: 8 }}>{error}</div>}
      {notes && notes.length === 0 && !error && (
        <div style={{ color: '#4B5563', fontSize: 11, padding: 8 }}>No notes yet. Be the first to log one.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(notes ?? []).map(n => (
          <div key={n.id} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, fontSize: 12, color: '#9BB0C4', lineHeight: 1.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 3 }}>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: 11 }}>
                {n.author}
                <span style={{ marginLeft: 6, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9B6DFF', padding: '1px 5px', background: 'rgba(155,109,255,0.10)', border: '1px solid rgba(155,109,255,0.25)', borderRadius: 3 }}>
                  {n.authorType === 'ADMIN' ? 'Leadership' : 'Upline'}
                </span>
              </span>
              <span style={{ fontSize: 10, color: '#6B8299', flexShrink: 0 }}>
                {new Date(n.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
          </div>
        ))}
      </div>
    </>
  )
}

// Flat "Also training" section — appears below the recruited tree
// in MyTeamTab when /api/agents/team returned cft-only members
// (people I'm listed as the trainer for but didn't recruit).
function AlsoTrainingSection({ members, previewToken }: {
  members: TraineeRow[]; previewToken?: string | null
}) {
  const [expandedCode, setExpandedCode] = useState<string | null>(null)
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 8 }}>
        Also training &middot; {members.length}
      </div>
      <div style={{ fontSize: 11, color: '#6B8299', marginBottom: 10, lineHeight: 1.5 }}>
        Agents who list you as their trainer but were recruited by someone else. You have read-only access to their contacts so you can coach.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {members.map(t => {
          const isExpanded = expandedCode === t.agentCode
          const display = (t.preferredName?.trim() || t.firstName) + ' ' + t.lastName
          return (
            <div key={t.agentCode} style={{
              background: '#132238', borderRadius: 8,
              border: `1px solid ${isExpanded ? 'rgba(201,169,110,0.35)' : 'rgba(255,255,255,0.06)'}`,
            }}>
              <button
                onClick={() => setExpandedCode(isExpanded ? null : t.agentCode)}
                style={{
                  width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: t.avatarUrl ? `url(${t.avatarUrl}) center/cover` : 'rgba(201,169,110,0.15)',
                  border: '1px solid rgba(201,169,110,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: '#C9A96E',
                }}>
                  {!t.avatarUrl && `${t.firstName[0] ?? ''}${t.lastName[0] ?? ''}`.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                    {display}
                    <span style={{ marginLeft: 8, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C9A96E', padding: '2px 6px', background: 'rgba(201,169,110,0.10)', border: '1px solid rgba(201,169,110,0.25)', borderRadius: 3 }}>Trainee</span>
                    {t.status === 'INACTIVE' && (
                      <span style={{ marginLeft: 6, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B8299', padding: '2px 6px', background: 'rgba(107,130,153,0.12)', borderRadius: 3 }}>Inactive</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: '#6B8299', marginTop: 2 }}>
                    {t.agentCode}{t.state ? ` · ${t.state}` : ''} · Phase {t.phase}
                  </div>
                </div>
                <Pill label="BP" count={t.partnerCount} accent="#4ADE80" />
                <Pill label="FTA" count={t.ftaCount} accent="#60A5FA" />
                <div style={{ fontSize: 12, color: '#C9A96E', marginLeft: 6, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>›</div>
              </button>
              {isExpanded && (
                <div style={{ borderTop: '1px solid rgba(201,169,110,0.15)', padding: '14px 16px' }}>
                  <ContactsDrilldown agentCode={t.agentCode} agentFirstName={t.firstName} previewToken={previewToken} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Pill({ label, count, accent }: { label: string; count: number; accent: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
      padding: '4px 10px', borderRadius: 4,
      background: count > 0 ? `${accent}10` : 'transparent',
      border: `1px solid ${count > 0 ? `${accent}30` : 'rgba(255,255,255,0.06)'}`,
      minWidth: 44,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: count > 0 ? accent : '#4B5563', lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6B8299' }}>{label}</div>
    </div>
  )
}

function PfrReadOnly({ agentCode, agentFirstName, previewToken }: { agentCode: string; agentFirstName: string; previewToken?: string | null }) {
  const [pfr, setPfr] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visionLightbox, setVisionLightbox] = useState(false)

  useEffect(() => {
    const url = `/api/agents/trainees/${agentCode}/pfr${previewToken ? `?preview=${encodeURIComponent(previewToken)}` : ''}`
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('Access denied'); return r.json() })
      .then((d: { pfr: Record<string, unknown> | null }) => setPfr(d.pfr))
      .catch(() => setError('Could not load PFR'))
      .finally(() => setLoading(false))
  }, [agentCode, previewToken])

  if (loading) return <div style={{ fontSize: 11, color: '#6B8299' }}>Loading {agentFirstName}&apos;s PFR...</div>
  if (error) return <div style={{ fontSize: 11, color: '#f87171' }}>{error}</div>
  if (!pfr) return <div style={{ fontSize: 11, color: '#4B5563' }}>{agentFirstName} hasn&apos;t started their PFR yet.</div>

  const p = pfr as { monthlyIncome?: number; expenses?: Record<string, number>; assets?: Record<string, number>; debts?: Record<string, number>; buckets?: Record<string, number>; dreamsAndGoals?: { timeFrame: string; dream: string; why: string }[]; retirementAge?: number; spouseRetAge?: number; desiredMonthlyRetirement?: number; monthlySavingsCommitment?: number; whatWouldThisDo?: string; whatIsStopping?: string; visionBoardUrl?: string | null; whyStatement?: string }
  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })
  const expenses = p.expenses ?? {}
  const assets = p.assets ?? {}
  const debts = p.debts ?? {}
  const buckets = p.buckets ?? {}
  const goals = p.dreamsAndGoals ?? []

  const totalExpenses = Object.values(expenses).reduce((a, b) => a + (b || 0), 0)
  const totalAssets = Object.values(assets).reduce((a, b) => a + (b || 0), 0)
  const totalDebts = Object.values(debts).reduce((a, b) => a + (b || 0), 0)
  const income = p.monthlyIncome ?? 0
  const netWorth = totalAssets - totalDebts
  const dimeNeed = totalDebts + (income * 12 * 10) + (debts.mortgage || 0) + (assets.collegeFunds || 0)

  const statStyle: React.CSSProperties = { textAlign: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.04)' }

  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#60a5fa', marginBottom: 10 }}>
        {agentFirstName}&apos;s Personal Financial Review
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: 12 }}>
        <div style={statStyle}>
          <div style={{ fontSize: 8, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Income</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#C9A96E' }}>{fmt(income)}</div>
        </div>
        <div style={statStyle}>
          <div style={{ fontSize: 8, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Expenses</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>{fmt(totalExpenses)}</div>
        </div>
        <div style={statStyle}>
          <div style={{ fontSize: 8, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Net Worth</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: netWorth >= 0 ? '#4ade80' : '#f87171' }}>{fmt(netWorth)}</div>
        </div>
        <div style={statStyle}>
          <div style={{ fontSize: 8, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.08em' }}>D.I.M.E.</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#60a5fa' }}>{fmt(dimeNeed)}</div>
        </div>
      </div>

      {/* Asset / Liability breakdown: skipped when both sides are empty
          so the read-only viewer stays compact for half-finished PFRs.
          Field labels mirror the editable PFR page (ASSET_LABELS /
          DEBT_LABELS in /agents/pfr/page.tsx). */}
      {(totalAssets > 0 || totalDebts > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 12 }}>
          <div style={{ padding: '8px 10px', background: 'rgba(74,222,128,0.04)', borderRadius: 4, border: '1px solid rgba(74,222,128,0.12)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Assets</div>
            {([
              ['retirement', 'Retirement'],
              ['checkingSavings', 'Checking / Savings'],
              ['collegeFunds', 'College Funds'],
              ['lifeInsurance', 'Life Insurance'],
              ['livingTrust', 'Living Trust & Will'],
            ] as const).map(([k, label]) => {
              const v = assets[k] || 0
              if (!v) return null
              return (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9BB0C4', marginBottom: 2 }}>
                  <span>{label}</span>
                  <span style={{ color: '#fff' }}>{fmt(v)}</span>
                </div>
              )
            })}
            {totalAssets === 0 && (
              <div style={{ fontSize: 11, color: '#4B5563', fontStyle: 'italic' }}>None entered</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, fontWeight: 700 }}>
              <span style={{ color: '#6B8299' }}>Total</span>
              <span style={{ color: '#4ade80' }}>{fmt(totalAssets)}</span>
            </div>
          </div>

          <div style={{ padding: '8px 10px', background: 'rgba(248,113,113,0.04)', borderRadius: 4, border: '1px solid rgba(248,113,113,0.12)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Liabilities</div>
            {([
              ['mortgage', 'Mortgage'],
              ['autoLoans', 'Auto Loans'],
              ['studentLoans', 'Student Loans'],
              ['creditCards', 'Credit Cards / Personal'],
            ] as const).map(([k, label]) => {
              const v = debts[k] || 0
              if (!v) return null
              return (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9BB0C4', marginBottom: 2 }}>
                  <span>{label}</span>
                  <span style={{ color: '#fff' }}>{fmt(v)}</span>
                </div>
              )
            })}
            {totalDebts === 0 && (
              <div style={{ fontSize: 11, color: '#4B5563', fontStyle: 'italic' }}>None entered</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, fontWeight: 700 }}>
              <span style={{ color: '#6B8299' }}>Total</span>
              <span style={{ color: '#f87171' }}>{fmt(totalDebts)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Buckets */}
      {Object.keys(buckets).length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#6B8299', marginBottom: 4 }}>4-Bucket Breakdown</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11 }}>
            {(['expenses', 'fun', 'emergency', 'retirement'] as const).map((k, i) => {
              const labels = ['Expenses', 'Fun', 'Emergency', 'Retirement']
              const colors = ['#4ade80', '#60a5fa', '#f59e0b', '#C9A96E']
              return buckets[k] ? <span key={k} style={{ color: colors[i] }}>{labels[i]}: {fmt(buckets[k])}</span> : null
            })}
          </div>
        </div>
      )}

      {/* Retirement goals */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: '#9BB0C4', marginBottom: 10 }}>
        {p.retirementAge ? <span>Retire at: <strong style={{ color: '#fff' }}>{p.retirementAge}</strong></span> : null}
        {p.desiredMonthlyRetirement ? <span>Monthly goal: <strong style={{ color: '#fff' }}>{fmt(p.desiredMonthlyRetirement)}</strong></span> : null}
        {p.monthlySavingsCommitment ? <span>Savings: <strong style={{ color: '#fff' }}>{fmt(p.monthlySavingsCommitment)}</strong>/mo</span> : null}
      </div>

      {/* Summary text fields */}
      {p.whatWouldThisDo && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#6B8299' }}>What would this do for you?</div>
          <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.5 }}>{p.whatWouldThisDo}</div>
        </div>
      )}
      {p.whatIsStopping && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#6B8299' }}>What is stopping you?</div>
          <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.5 }}>{p.whatIsStopping}</div>
        </div>
      )}

      {/* Vision Board */}
      {p.visionBoardUrl && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#6B8299', marginBottom: 4 }}>My Vision Board</div>
          <div
            onClick={() => setVisionLightbox(true)}
            style={{ cursor: 'pointer', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(201,169,110,0.12)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.visionBoardUrl} alt="Vision Board" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', display: 'block' }} />
          </div>
        </div>
      )}

      {/* Your Why */}
      {p.whyStatement && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#6B8299', marginBottom: 4 }}>Your &ldquo;Why&rdquo;</div>
          <div style={{ fontSize: 11, color: '#9BB0C4', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{p.whyStatement}</div>
        </div>
      )}

      {/* Dreams & Goals */}
      {goals.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#6B8299', marginBottom: 4 }}>Dreams & Goals</div>
          {goals.map((g, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, color: '#9BB0C4', marginBottom: 3 }}>
              {g.timeFrame && <span style={{ color: '#C9A96E', fontWeight: 600, flexShrink: 0 }}>{String(g.timeFrame)}</span>}
              <span>{String(g.dream)}</span>
              {g.why && <span style={{ color: '#4B5563' }}>&mdash; {String(g.why)}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Vision Board Lightbox */}
      {visionLightbox && p.visionBoardUrl && (
        <div
          onClick={() => setVisionLightbox(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', padding: 24,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.visionBoardUrl}
            alt="Vision Board"
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

function DrillSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A96E', marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function PartnerRow({ p, agentCode, previewToken }: { p: TraineePartner; agentCode: string; previewToken?: string | null }) {
  const [expanded, setExpanded] = useState(false)
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : null

  const badges = [
    p.married && 'Married',
    p.children && 'Children',
    p.homeowner && 'Homeowner',
    p.bookedAppt && 'Booked',
  ].filter(Boolean)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', borderRadius: 6, overflow: 'hidden',
      border: expanded ? '1px solid rgba(201,169,110,0.15)' : '1px solid transparent',
      transition: 'border-color 0.15s',
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{p.name}</span>
            {p.category && (
              <span style={{ fontSize: 8, fontWeight: 700, color: '#C9A96E', padding: '1px 6px', background: 'rgba(201,169,110,0.08)', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {p.category.replace(/_/g, ' ')}
              </span>
            )}
            {p.status && (
              <span style={{ fontSize: 8, fontWeight: 700, color: '#60a5fa', padding: '1px 6px', background: 'rgba(96,165,250,0.08)', borderRadius: 3, textTransform: 'uppercase' }}>
                {p.status}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 11, color: '#6B8299', flexWrap: 'wrap' }}>
            {p.phone && <span>{p.phone}</span>}
            {p.email && <span>{p.phone ? '·' : ''} {p.email}</span>}
            {p.occupation && <span>· {p.occupation}</span>}
          </div>
        </div>
        <span style={{ fontSize: 10, color: '#4B5563', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>&#9660;</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px 16px', marginTop: 10, fontSize: 11 }}>
            {p.timeZone && <Field label="Time Zone" value={p.timeZone} />}
            {p.age && <Field label="Age" value={p.age} />}
            {p.occupation && <Field label="Occupation" value={p.occupation} />}
            {fmtDate(p.appointmentDate) && <Field label="Appt Date" value={fmtDate(p.appointmentDate)!} />}
            {fmtDate(p.firstCallDate) && <Field label="1st Call" value={fmtDate(p.firstCallDate)!} />}
            {fmtDate(p.secondCallDate) && <Field label="2nd Call" value={fmtDate(p.secondCallDate)!} />}
            {fmtDate(p.lastContactAt) && <Field label="Last Contact" value={fmtDate(p.lastContactAt)!} />}
            {fmtDate(p.createdAt) && <Field label="Added" value={fmtDate(p.createdAt)!} />}
          </div>
          {badges.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {badges.map(b => (
                <span key={b as string} style={{ fontSize: 9, fontWeight: 600, color: '#4ade80', padding: '1px 8px', background: 'rgba(74,222,128,0.08)', borderRadius: 10 }}>
                  {b}
                </span>
              ))}
            </div>
          )}
          {p.characterTraits && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#6B8299', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Character Traits</div>
              <div style={{ fontSize: 11, color: '#9BB0C4' }}>{p.characterTraits}</div>
            </div>
          )}
          {p.notes && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#6B8299', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Agent Notes</div>
              <div style={{ fontSize: 11, color: '#9BB0C4', fontStyle: 'italic' }}>{p.notes}</div>
            </div>
          )}

          {/* Threaded notes — visible to both agent and trainer */}
          <ContactNotesThread partnerId={p.id} previewToken={previewToken} />
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 8, fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ fontSize: 12, color: '#9BB0C4', marginTop: 1 }}>{value}</div>
    </div>
  )
}

function FtaRow({ f }: { f: TraineeFta }) {
  const when = new Date(f.appointmentDate).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
  return (
    <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, fontSize: 12, color: '#9BB0C4', lineHeight: 1.5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ color: '#fff', fontWeight: 600 }}>{f.businessPartner?.name ?? 'Walk-in / unnamed'}</div>
        <div style={{ fontSize: 11, color: '#6B8299' }}>{when}</div>
      </div>
      <div style={{ marginTop: 2, fontSize: 11, color: '#6B8299' }}>{f.status.toLowerCase()}</div>
      {f.notes && <div style={{ marginTop: 4, fontSize: 11, color: '#6B8299', fontStyle: 'italic' }}>{f.notes}</div>}
    </div>
  )
}

function MyTeamTab({ isMobile, previewToken }: { isMobile: boolean; previewToken?: string | null }) {
  const [team, setTeam] = useState<TeamNode[]>([])
  // Agents whose `cft` is me but who I didn't recruit. Surfaced as
  // a flat "Also training" section under the recruited tree so a
  // trainer assigned outside their own downline still gets visibility.
  const [cftOnly, setCftOnly] = useState<TraineeRow[]>([])
  const [totalSize, setTotalSize] = useState(0)
  const [activeSize, setActiveSize] = useState(0)
  const [loading, setLoading] = useState(true)
  // "See full team" toggle: default off (active producers only).
  // Resets each visit by design — the optimistic frame is "look at
  // your producing team," and we don't want a persisted preference
  // landing the agent on the audit view by default.
  const [showFullTeam, setShowFullTeam] = useState(false)
  // Trading-card modal: opened by clicking a team member's avatar/name.
  // Lifted to the tab so a single modal renders no matter which depth
  // of TeamMemberNode the click came from.
  const [cardCode, setCardCode] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (previewToken) params.set('preview', previewToken)
    if (showFullTeam) params.set('includeInactive', '1')
    const qs = params.toString()
    const url = qs ? `/api/agents/team?${qs}` : '/api/agents/team'
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((d: { team: TeamNode[]; totalTeamSize: number; activeTeamSize?: number; cftOnlyMembers?: TraineeRow[] }) => {
        setTeam(d.team ?? [])
        setTotalSize(d.totalTeamSize ?? 0)
        setActiveSize(d.activeTeamSize ?? 0)
        setCftOnly(d.cftOnlyMembers ?? [])
      })
      .catch(() => { /* no team data available */ })
      .finally(() => setLoading(false))
  }, [previewToken, showFullTeam])

  if (loading) return <div style={{ color: '#6B8299', fontSize: 13, padding: 40, textAlign: 'center' }}>Loading your team...</div>

  if (team.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>👥</div>
      <div style={{ fontSize: 16, fontWeight: 500, color: '#fff', marginBottom: 8 }}>Build Your Team</div>
      <div style={{ fontSize: 13, color: '#6B8299', maxWidth: 360, margin: '0 auto', lineHeight: 1.6 }}>
        When you refer new agents from the Partners tab, they&apos;ll show up here as part of your coaching tree. Start building your team by submitting a referral.
      </div>
    </div>
  )

  return (
    <div style={{ padding: isMobile ? '0' : '0 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{
          padding: '10px 16px', background: '#132238', borderRadius: 6,
          border: '1px solid rgba(74,222,128,0.18)',
        }}>
          <span style={{ fontSize: 20, fontWeight: 300, color: '#4ADE80', fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
            {activeSize}
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B8299', marginLeft: 8 }}>
            Active
          </span>
        </div>
        <div style={{
          padding: '10px 16px', background: '#132238', borderRadius: 6,
          border: '1px solid rgba(201,169,110,0.12)',
        }}>
          <span style={{ fontSize: 20, fontWeight: 300, color: '#C9A96E', fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
            {totalSize}
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B8299', marginLeft: 8 }}>
            Total Pipeline
          </span>
        </div>
        <div style={{
          padding: '10px 16px', background: '#132238', borderRadius: 6,
          border: '1px solid rgba(96,165,250,0.12)',
        }}>
          <span style={{ fontSize: 20, fontWeight: 300, color: '#60a5fa', fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
            {team.length}
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B8299', marginLeft: 8 }}>
            Direct
          </span>
        </div>
        {/* "See full team" toggle: positively framed, defaults to OFF
            so the team view leads with active producers. Pulled inactive
            agents in via ?includeInactive=1 when toggled on. */}
        <button
          onClick={() => setShowFullTeam(v => !v)}
          style={{
            marginLeft: 'auto',
            padding: '8px 14px',
            background: showFullTeam ? 'rgba(201,169,110,0.10)' : 'transparent',
            border: `1px solid ${showFullTeam ? 'rgba(201,169,110,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: showFullTeam ? '#C9A96E' : '#9BB0C4',
            borderRadius: 6, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}
          title={showFullTeam ? 'Show only active producers' : 'Include inactive agents you recruited'}
        >
          {showFullTeam ? 'Active only' : 'See full team'}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {team.map(node => (
          <TeamMemberNode key={node.id} node={node} depth={0} isMobile={isMobile} onOpenCard={setCardCode} previewToken={previewToken} />
        ))}
      </div>
      {cftOnly.length > 0 && (
        <AlsoTrainingSection members={cftOnly} previewToken={previewToken} />
      )}
      {cardCode && <AgentTradingCardModal agentCode={cardCode} onClose={() => setCardCode(null)} />}
    </div>
  )
}

// Small NPN / license-number chips rendered next to a Business Partner's
// name when the contact has been auto-linked to an AgentProfile (i.e.
// the recruit got onboarded and filled in their NPN on their own
// profile). Click to copy, so the writing agent can paste straight
// into a carrier portal during an app submission.
function LinkedAgentChips({ linked }: { linked: { npn: string | null; licenseNumber: string | null } | null }) {
  const [copied, setCopied] = useState<string | null>(null)
  if (!linked) return null
  if (!linked.npn && !linked.licenseNumber) return null
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      setTimeout(() => setCopied(null), 1200)
    } catch { /* clipboard blocked, ignore */ }
  }
  const chip = (label: string, value: string) => (
    <button
      key={label}
      onClick={e => { e.stopPropagation(); copy(label, value) }}
      title={`Click to copy ${label}: ${value}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        marginLeft: 6, padding: '1px 6px',
        background: copied === label ? 'rgba(74,222,128,0.15)' : 'rgba(201,169,110,0.10)',
        border: `1px solid ${copied === label ? 'rgba(74,222,128,0.4)' : 'rgba(201,169,110,0.3)'}`,
        borderRadius: 3, cursor: 'pointer',
        fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
        color: copied === label ? '#4ade80' : '#C9A96E',
        fontFamily: 'inherit',
      }}
    >
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontFamily: 'monospace', letterSpacing: '0.02em' }}>{copied === label ? '✓' : value}</span>
    </button>
  )
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap' }}>
      {linked.npn && chip('NPN', linked.npn)}
      {linked.licenseNumber && chip('LIC', linked.licenseNumber)}
    </span>
  )
}


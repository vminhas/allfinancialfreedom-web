// Single source of truth for milestone definitions. Used by:
//   - the agent dashboard (progressions section + "Submit for review")
//   - the vault milestones page (admin queue + criteria text)
//   - the API routes (validation: only allow submit/award for known keys)
//
// Two award modes:
//   'auto'       - derived from existing data (phase items, carriers,
//                  phase number). No DB row needed. Badge lights up
//                  the instant the underlying data flips.
//   'submission' - agent self-attests with optional proof note, admin
//                  approves or rejects from the vault. A
//                  RecognitionMilestone row tracks the request.
//
// Adding a new milestone: append to MILESTONES, add a corresponding
// auto-rule in computeProgressions (agents/page.tsx) if award='auto',
// or just add the row here if award='submission'.

export type MilestoneAward = 'auto' | 'submission'

export interface MilestoneDefinition {
  key: string
  label: string
  // Short description shown beneath the badge / row label.
  description: string
  // Full criteria copy. The vault page shows this verbatim so admins
  // can verify the agent meets the bar before approving. The agent
  // dashboard surfaces it in the "what does this take?" tooltip.
  criteria: string
  award: MilestoneAward
  // Used for visual grouping in the vault queue. Phase ordering reads
  // intuitively for both admins and agents.
  phase: number
}

export const MILESTONES: MilestoneDefinition[] = [
  {
    key: 'code_number',
    label: 'Code Number Issued',
    description: 'You\'re officially on the AFF roster.',
    criteria: 'Auto-issued the moment the licensing coordinator creates an AFF agent code for you.',
    award: 'auto',
    phase: 1,
  },
  {
    key: 'pass_license',
    label: 'Life License',
    description: 'Passed the state life insurance exam.',
    criteria: 'Complete "Pass Life License Test" in Phase 1.',
    award: 'auto',
    phase: 1,
  },
  {
    key: 'business_partner_plan',
    label: 'Business Marketing Plan',
    description: 'Mapped out your starter contact list.',
    criteria: 'Complete "Business Marketing Plan" in Phase 1.',
    award: 'auto',
    phase: 1,
  },
  {
    key: 'client',
    label: 'First Client',
    description: 'Helped your first family.',
    criteria: 'Check off "Help Your 1st Client" in Phase 2.',
    award: 'auto',
    phase: 2,
  },
  {
    key: 'licensed_appointed',
    label: 'Licensed & Appointed',
    description: 'Net licensed and appointed with at least one carrier.',
    criteria: 'Earn your Net License (first $1,000 in commission) and have at least one carrier marked APPOINTED.',
    award: 'auto',
    phase: 2,
  },
  {
    key: '10_field_trainings',
    label: '10 Field Trainings',
    description: 'Completed 10 Field Training Appointments.',
    criteria: 'Complete all 10 Field Training Appointments in Phase 2.',
    award: 'auto',
    phase: 2,
  },
  {
    key: 'net_license',
    label: 'Net License',
    description: 'Earned your first $1,000 in commission.',
    criteria: 'Hit $1,000 in lifetime commission. Auto-checks via the "first_1000" Phase 2 item.',
    award: 'auto',
    phase: 2,
  },
  {
    key: 'associate_promotion',
    label: 'Senior Associate Promotion',
    description: 'Earned the Senior Associate rank.',
    criteria: 'Complete every Phase 2 item and request your promotion via the licensing coordinator. Admin approves the rank earn.',
    award: 'auto',
    phase: 2,
  },
  {
    key: 'cft_in_progress',
    label: 'CFT in Progress',
    description: 'Started Certified Field Trainer classes.',
    criteria: 'Attend CFT In Progress classes in Phase 3.',
    award: 'auto',
    phase: 3,
  },
  {
    key: 'certified_field_trainer',
    label: 'Certified Field Trainer',
    description: 'Earned the CFT signoff.',
    criteria: 'Complete CFT Coordinator Sign Off in Phase 3.',
    award: 'auto',
    phase: 3,
  },
  {
    key: 'elite_trainer',
    label: 'Elite Trainer',
    description: 'Recognized as an Elite Trainer with a fully certified team.',
    criteria: 'Be at Phase 4 or above with a fully certified team. Submit for review with the names of your certified trainees and the licensing coordinator (or an admin) will confirm and award the badge.',
    award: 'submission',
    phase: 4,
  },
  {
    key: 'marketing_director',
    label: 'Marketing Director',
    description: 'Hit 45,000 production points in Phase 4.',
    criteria: 'Accumulate 45,000 production points in Phase 4. Auto-checks via the "45k_points" Phase 4 item.',
    award: 'auto',
    phase: 4,
  },
  {
    key: '50k_watch',
    label: '$50k Watch',
    description: 'Earned the $50,000 production watch.',
    criteria: 'Earn $50,000 in total production. Submit with your AP report or carrier production statement and an admin will award the watch.',
    award: 'submission',
    phase: 4,
  },
  {
    key: '100k_ring',
    label: '$100k Ring',
    description: 'Earned the $100,000 production ring.',
    criteria: 'Earn $100,000 in total production. Submit with your AP report or carrier production statement and an admin will award the ring.',
    award: 'submission',
    phase: 4,
  },
  {
    key: 'emd',
    label: 'Executive Marketing Director',
    description: 'Promoted into Phase 5 (EMD track).',
    criteria: 'Maintain 150,000 net points over a rolling 6-month window in Phase 5. Submit with your production summary; an admin reviews and awards EMD status.',
    award: 'submission',
    phase: 5,
  },
]

export const MILESTONE_BY_KEY: Record<string, MilestoneDefinition> =
  Object.fromEntries(MILESTONES.map(m => [m.key, m]))

export function isSubmittable(key: string): boolean {
  return MILESTONE_BY_KEY[key]?.award === 'submission'
}

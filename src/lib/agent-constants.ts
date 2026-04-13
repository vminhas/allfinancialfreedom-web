// Phase checklist items — stored as PhaseItem rows per agent
export const PHASE_ITEMS: Record<number, { key: string; label: string }[]> = {
  1: [
    { key: 'week1_onboarding', label: 'Week 1 Onboarding' },
    { key: 'licensing_class', label: 'Licensing Class / Schedule Test' },
    { key: 'pfr', label: 'Personal Financial Review' },
    { key: 'fast_start_school', label: 'Fast Start School' },
    { key: 'week2_onboarding', label: 'Week 2 Onboarding' },
    { key: '3_business_partners', label: '3 Business Partners' },
    { key: 'business_marketing_plan', label: 'Business Marketing Plan' },
    { key: 'pass_license_test', label: 'Pass Life License Test' },
    { key: 'fingerprints_apply', label: 'Fingerprints + Apply for License' },
    { key: 'week3_onboarding', label: 'Week 3 Onboarding' },
    { key: 'master_scripts', label: 'Master Scripts' },
    { key: 'schedule_10_trainings', label: 'Schedule 10 Training Appointments' },
  ],
  2: [
    { key: 'fta_1', label: 'Field Training 1 (Spouse / Parents)' },
    { key: 'fta_2', label: 'Field Training 2' },
    { key: 'fta_3', label: 'Field Training 3' },
    { key: 'fta_4', label: 'Field Training 4' },
    { key: 'fta_5', label: 'Field Training 5' },
    { key: 'fta_6', label: 'Field Training 6' },
    { key: 'fta_7', label: 'Field Training 7' },
    { key: 'fta_8', label: 'Field Training 8' },
    { key: 'fta_9', label: 'Field Training 9' },
    { key: 'fta_10', label: 'Field Training 10' },
    { key: 'associate_promotion', label: 'Associate Promotion' },
    { key: 'direct_1', label: 'Direct 1' },
    { key: 'direct_2', label: 'Direct 2' },
    { key: 'direct_3', label: 'Direct 3' },
    { key: 'client_1', label: 'Client Helped 1' },
    { key: 'client_2', label: 'Client Helped 2' },
    { key: 'client_3', label: 'Client Helped 3' },
    { key: 'net_license', label: 'Net License' },
    { key: 'first_1000', label: "Make Your 1st $1,000" },
  ],
  3: [
    { key: 'cft_classes', label: 'Attend CFT in Progress Classes' },
    { key: 'trainer_signoff', label: 'Signed Off by Trainer' },
    { key: 'cft_coordinator_signoff', label: 'CFT Coordinator Sign Off' },
    { key: 'emd_signoff', label: 'EMD Sign Off' },
    { key: 'client_1st_apt', label: 'Client 1st Appointment' },
    { key: 'client_2nd_apt', label: 'Client 2nd Appointment' },
    { key: 'phone_call_scripts', label: 'Phone Call Scripts' },
    { key: 'recruiting_interview', label: 'Recruiting Interview' },
    { key: 'system_knowledge', label: 'System Knowledge' },
    { key: 'top_5_products', label: 'Top 5 Products' },
    { key: 'fixed_indexed_annuity', label: 'Fixed Indexed Annuity' },
    { key: 'final_expense', label: 'Final Expense' },
    { key: 'term_lb', label: 'Term / Term LB' },
    { key: 'iul_family_bank', label: 'IUL / Family Bank' },
    { key: 'million_dollar_baby', label: 'Million Dollar Baby' },
  ],
  4: [
    { key: '45k_points', label: '45,000 Points' },
    { key: 'month1_premium', label: 'Month 1 — $1,250 Premium' },
    { key: 'month2_premium', label: 'Month 2 — $1,250 Premium' },
    { key: 'month3_premium', label: 'Month 3 — $1,250 Premium' },
    { key: 'license_net_1', label: 'License 1 (Net)' },
    { key: 'license_net_2', label: 'License 2 (Net)' },
    { key: 'license_net_3', label: 'License 3 (Net)' },
    { key: 'license_net_4', label: 'License 4 (Net)' },
    { key: 'license_net_5', label: 'License 5 (Net)' },
  ],
  5: [
    { key: '150k_net_6mo', label: '150,000 Net Points in 6 Months' },
    { key: '1_marketing_director', label: '1 Marketing Director' },
    { key: 'license_1', label: 'License 1' },
    { key: 'license_2', label: 'License 2' },
    { key: 'license_3', label: 'License 3' },
    { key: 'license_4', label: 'License 4' },
    { key: 'license_5', label: 'License 5' },
    { key: 'license_6', label: 'License 6' },
    { key: 'license_7', label: 'License 7' },
    { key: 'license_8', label: 'License 8' },
    { key: 'license_9', label: 'License 9' },
    { key: 'license_10', label: 'License 10' },
    { key: 'license_11', label: 'License 11' },
    { key: 'license_12', label: 'License 12' },
    { key: 'license_13', label: 'License 13' },
    { key: 'license_14', label: 'License 14' },
    { key: 'license_15', label: 'License 15' },
    { key: 'license_16', label: 'License 16' },
    { key: 'license_17', label: 'License 17' },
    { key: 'license_18', label: 'License 18' },
    { key: 'license_19', label: 'License 19' },
    { key: 'license_20', label: 'License 20' },
  ],
}

export const PHASE_LABELS: Record<number, { title: string; standard: string; goal: string }> = {
  1: { title: 'Getting Started', standard: '7–21 Day Standard', goal: 'License & Onboard' },
  2: { title: 'Field Training', standard: 'First 30 Day Standard', goal: '10 FTAs + First $1,000' },
  3: { title: 'Becoming a CFT', standard: '45–60 Day Standard', goal: 'CFT Certification' },
  4: { title: 'MD Focus', standard: 'MD Plan', goal: '45,000 Points + 5 Licenses' },
  5: { title: 'EMD Focus', standard: 'EMD Plan', goal: '150K Net Points + 20 Licenses' },
}

// Discord roles per phase — guild role IDs stored in Settings table
// Key format: DISCORD_ROLE_PHASE_{n}
export const DISCORD_PHASE_ROLE_KEYS = [1, 2, 3, 4, 5].map(n => `DISCORD_ROLE_PHASE_${n}`)
export const DISCORD_GUILD_ID_KEY = 'DISCORD_GUILD_ID'
export const DISCORD_BOT_TOKEN_KEY = 'DISCORD_BOT_TOKEN'

export const CARRIERS = [
  'ANICO Life',
  'ANICO Annuity',
  'Augustar',
  'Corebridge Life',
  'Corebridge Annuity',
  'Lincoln',
  'Foresters',
  'Mutual of Omaha',
  'SILAC',
  'American Equity',
  'North American Life',
  'North American Annuity',
  'F&G Life',
  'F&G Annuity',
  'Equitrust',
  'Prudential',
] as const

export type Carrier = typeof CARRIERS[number]

// At-risk thresholds: days in phase + max % complete before flagged
export const AT_RISK_THRESHOLDS: Record<number, { days: number; minPct: number }> = {
  1: { days: 21, minPct: 0.8 },
  2: { days: 30, minPct: 0.6 },
  3: { days: 60, minPct: 0.6 },
  4: { days: 90, minPct: 0.3 },
  5: { days: 180, minPct: 0.3 },
}

export function getAtRiskStatus(
  phase: number,
  phaseStartedAt: Date | null,
  completedItems: number,
  totalItems: number
): 'on-track' | 'behind' | 'at-risk' {
  if (!phaseStartedAt) return 'on-track'
  const threshold = AT_RISK_THRESHOLDS[phase]
  if (!threshold) return 'on-track'
  const daysInPhase = Math.floor((Date.now() - phaseStartedAt.getTime()) / (1000 * 60 * 60 * 24))
  const pct = totalItems > 0 ? completedItems / totalItems : 0
  if (daysInPhase > threshold.days * 1.5 && pct < threshold.minPct) return 'at-risk'
  if (daysInPhase > threshold.days && pct < threshold.minPct) return 'behind'
  return 'on-track'
}

// Phase checklist items — stored as PhaseItem rows per agent
// Each item has a first-person vignette (description) read by the agent during
// onboarding. Items handled by the Licensing Coordinator include a
// `coordinatorTopic` so the agent portal can render a direct-request button.
export type LicensingCoordinatorTopic =
  | 'SCHEDULE_EXAM'
  | 'PASS_POST_LICENSING'
  | 'FINGERPRINTS_APPLY'
  | 'GFI_APPOINTMENTS'
  | 'CE_COURSES'
  | 'EO_INSURANCE'
  | 'DIRECT_DEPOSIT'
  | 'UNDERWRITING'
  | 'GENERAL'

export interface PhaseItemDef {
  key: string
  label: string
  description: string
  tab?: string
  coordinatorTopic?: LicensingCoordinatorTopic
}

export const PHASE_ITEMS: Record<number, PhaseItemDef[]> = {
  1: [
    {
      key: 'week1_onboarding',
      label: 'Week 1 Onboarding',
      description: "This week your trainer walks you through AFF's flagship products and the reasons behind them. By the end of the week you'll understand exactly what you're offering to clients and why it matters.",
    },
    {
      key: 'connect_discord',
      label: 'Connect Discord',
      description: "Join the AFF Discord server and link your account so you get access to your phase training channels, weekly training reminders, and team resources. Use the button below to connect — it takes 10 seconds.",
    },
    {
      key: 'licensing_class',
      label: 'Licensing Class / Schedule Test',
      description: "Schedule your pre-licensing course and exam with the licensing coordinator. They'll walk you through the process, help you pick a test date, and answer any questions along the way. Use the button below to reach them directly.",
      coordinatorTopic: 'SCHEDULE_EXAM',
    },
    {
      key: 'pfr',
      label: 'Personal Financial Review',
      description: "Sit down with your trainer for your own Personal Financial Review. This is both a real planning session for your finances and your first hands-on experience with the tool you'll use to help families.",
    },
    {
      key: 'fast_start_school',
      label: 'Fast Start School',
      description: "A company-wide walkthrough of what to focus on in your first 30 days. Held Saturdays at 11am Eastern — your trainer will send you the link and details.",
    },
    {
      key: 'week2_onboarding',
      label: 'Week 2 Onboarding',
      description: "This week you'll build out your lead-generation marketing plan with your trainer. Come prepared with ideas about your natural market.",
    },
    {
      key: 'business_marketing_plan',
      label: 'Business Marketing Plan',
      description: "Work with your CFT to build your personal Business Marketing Plan. This becomes your 90-day playbook: target market, daily activity targets, and growth goals.",
    },
    {
      key: 'pass_license_test',
      label: 'Pass Life License Test',
      description: "Pass your state life insurance exam. The moment you pass, schedule your post-licensing call with the licensing coordinator and your EMD — that's where your next steps get mapped out. Use the button below to reach out.",
      coordinatorTopic: 'PASS_POST_LICENSING',
    },
    {
      key: 'fingerprints_apply',
      label: 'Fingerprints + Apply for License',
      description: "Schedule your fingerprinting and file your state license application. The licensing coordinator handles this with you — use the button below to send a request.",
      coordinatorTopic: 'FINGERPRINTS_APPLY',
    },
    {
      key: 'submit_to_aff',
      label: 'Submit to GFI',
      description: "This is what gets you appointed to all of the different carriers. The licensing coordinator handles the submission for you — send a request directly from this item.",
      coordinatorTopic: 'GFI_APPOINTMENTS',
    },
    {
      key: 'ce_courses',
      label: 'Complete CE Courses (AML, Annuity & Ethics)',
      description: "Complete your Continuing Education courses: AML, Annuity, and Ethics. The licensing coordinator will point you to the provider and help you past any snags.",
      coordinatorTopic: 'CE_COURSES',
    },
    {
      key: 'errors_and_omissions',
      label: 'Errors & Omissions Insurance',
      description: "Apply for your Errors & Omissions (E&O) insurance policy. The licensing coordinator walks you through the application.",
      coordinatorTopic: 'EO_INSURANCE',
    },
    {
      key: 'direct_deposit',
      label: 'Set Up Direct Deposit',
      description: "Set up direct deposit so your commissions land in your account automatically. The licensing coordinator will help you finish this.",
      coordinatorTopic: 'DIRECT_DEPOSIT',
    },
    {
      key: 'week3_onboarding',
      label: 'Week 3 Onboarding',
      description: "This week you'll start scheduling Field Training Appointments (FTAs) with your Certified Field Trainer.",
    },
    {
      key: 'master_scripts',
      label: 'Master Scripts',
      description: "Learn the scheduling and presentation scripts you'll use on your Field Training calls. Drill them until they feel natural.",
    },
    {
      key: 'schedule_10_trainings',
      label: 'Schedule 10 Training Appointments',
      description: "Schedule your first 10 Field Training Appointments alongside your trainer. Once these are booked, you're ready to move into Phase 2.",
      tab: 'partners',
    },
  ],
  2: [
    {
      key: '3_business_partners',
      label: '3 Business Partners',
      description: "Identify the first 3 people from your network you'd like to introduce to the AFF opportunity. Your trainer will guide you through the conversations — these become the foundation for your field training.",
      tab: 'partners',
    },
    {
      key: 'fta_1',
      label: 'Field Training 1 (Spouse / Parents)',
      description: 'Your first Field Training Appointment — a live appointment with your CFT trainer. FTA 1 is typically with your immediate family (spouse, parents) to practice in a supportive environment.',
      tab: 'partners',
    },
    { key: 'fta_2', label: 'Field Training 2', description: 'Field Training Appointment 2 — continue building confidence running live appointments alongside your CFT trainer.', tab: 'partners' },
    { key: 'fta_3', label: 'Field Training 3', description: 'Field Training Appointment 3 — your presenter role should be growing. Aim to lead more of the appointment with your trainer observing.', tab: 'partners' },
    { key: 'fta_4', label: 'Field Training 4', description: 'Field Training Appointment 4.', tab: 'partners' },
    { key: 'fta_5', label: 'Field Training 5', description: 'Field Training Appointment 5 — halfway point. By now you should feel comfortable with the full AFF presentation flow.', tab: 'partners' },
    { key: 'fta_6', label: 'Field Training 6', description: 'Field Training Appointment 6.', tab: 'partners' },
    { key: 'fta_7', label: 'Field Training 7', description: 'Field Training Appointment 7.', tab: 'partners' },
    { key: 'fta_8', label: 'Field Training 8', description: 'Field Training Appointment 8.', tab: 'partners' },
    { key: 'fta_9', label: 'Field Training 9', description: 'Field Training Appointment 9.', tab: 'partners' },
    {
      key: 'fta_10',
      label: 'Field Training 10',
      description: 'Field Training Appointment 10 — completing all 10 FTAs demonstrates you are ready to run appointments independently and begin building your team.',
      tab: 'partners',
    },
    {
      key: 'associate_promotion',
      label: 'Associate Promotion',
      description: 'Officially promoted to Associate level within AFF. This recognizes your completion of Phase 1 requirements and confirms you\'re ready for independent field work.',
    },
    {
      key: 'direct_1',
      label: 'Direct 1',
      description: 'Sponsor and onboard your first direct agent — someone you personally recruited who has joined AFF. Building your team starts here.',
      tab: 'partners',
    },
    { key: 'direct_2', label: 'Direct 2', description: 'Sponsor and onboard your second direct agent on your team.', tab: 'partners' },
    { key: 'direct_3', label: 'Direct 3', description: 'Sponsor and onboard your third direct agent. Three actives is the foundation of a growing agency.', tab: 'partners' },
    {
      key: 'client_1',
      label: 'Client Helped 1',
      description: 'Help your first client — complete a full financial needs analysis and present a real solution. Document the case in your Policies tab.',
      tab: 'policies',
    },
    { key: 'client_2', label: 'Client Helped 2', description: 'Help your second client. Each client you serve builds your experience and your track record.', tab: 'policies' },
    { key: 'client_3', label: 'Client Helped 3', description: 'Help your third client. Three cases demonstrates consistent client service — a major milestone.', tab: 'policies' },
    {
      key: 'net_license',
      label: 'Net License',
      description: 'Receive and activate your physical or digital life insurance license from your state. You are now fully authorized to sell and earn commissions.',
    },
    {
      key: 'first_1000',
      label: "Make Your 1st $1,000",
      description: 'Earn your first $1,000 in commission from issued and paid policies. This milestone proves the system works — and it\'s just the start of what\'s possible.',
      tab: 'policies',
    },
  ],
  3: [
    {
      key: 'cft_classes',
      label: 'Attend CFT in Progress Classes',
      description: 'Attend CFT (Certified Field Trainer) In Progress sessions hosted by AFF leadership. These are the advanced classes that teach you how to train and develop new agents.',
    },
    {
      key: 'trainer_signoff',
      label: 'Signed Off by Trainer',
      description: 'Your CFT trainer officially signs off that you can run appointments independently and are ready to begin training others. This is a formal milestone in your development.',
    },
    {
      key: 'cft_coordinator_signoff',
      label: 'CFT Coordinator Sign Off',
      description: 'The CFT Coordinator — a senior AFF trainer — reviews your performance and approves your readiness for CFT designation.',
    },
    {
      key: 'emd_signoff',
      label: 'EMD Sign Off',
      description: 'The Elite Marketing Director reviews and signs off on your CFT designation. This is the final approval before you advance to Phase 4.',
    },
    {
      key: 'client_1st_apt',
      label: 'Client 1st Appointment',
      description: 'Run a complete first client appointment independently — conducting the financial needs analysis and presenting the AFF system without your trainer present.',
      tab: 'policies',
    },
    {
      key: 'client_2nd_apt',
      label: 'Client 2nd Appointment',
      description: 'Run the follow-up (second) appointment independently — presenting personalized solutions and closing the case on your own.',
      tab: 'policies',
    },
    {
      key: 'phone_call_scripts',
      label: 'Phone Call Scripts',
      description: 'Master all phone scripts: client scheduling calls, recruiting calls, and follow-up calls. Demonstrate the ability to set quality appointments via phone alone.',
      tab: 'calls',
    },
    {
      key: 'recruiting_interview',
      label: 'Recruiting Interview',
      description: 'Conduct a full recruiting interview with a prospective agent candidate using the official AFF interview process. Document it in your Business Partners tab.',
      tab: 'partners',
    },
    {
      key: 'system_knowledge',
      label: 'System Knowledge',
      description: 'Demonstrate comprehensive knowledge of the full AFF system: the business model, compensation structure, agent career path, and how to explain it to prospects.',
    },
    {
      key: 'top_5_products',
      label: 'Top 5 Products',
      description: 'Develop working knowledge of the top 5 AFF products. You must be able to identify which product fits each client scenario and explain the core benefits clearly.',
    },
    {
      key: 'fixed_indexed_annuity',
      label: 'Fixed Indexed Annuity',
      description: 'Complete product certification on Fixed Indexed Annuities (FIA) — tax-deferred retirement vehicles with upside tied to a market index and downside protection.',
    },
    {
      key: 'final_expense',
      label: 'Final Expense',
      description: 'Complete training on Final Expense products — simplified-issue permanent life insurance designed to cover end-of-life costs. A key product for the senior market.',
    },
    {
      key: 'term_lb',
      label: 'Term / Term LB',
      description: 'Complete product training on Term Life and Term with Living Benefits. Understand when to recommend pure term vs. term with critical illness or chronic illness riders.',
    },
    {
      key: 'iul_family_bank',
      label: 'IUL / Family Bank',
      description: 'Master the Indexed Universal Life (IUL) / Family Bank strategy — AFF\'s signature wealth-building product. Clients use it to build tax-free retirement income and a family legacy.',
    },
    {
      key: 'million_dollar_baby',
      label: 'Million Dollar Baby',
      description: 'Complete training on the Million Dollar Baby strategy — an IUL funded for infants or children that grows into a tax-advantaged wealth vehicle over their lifetime.',
    },
  ],
  4: [
    {
      key: '45k_points',
      label: '45,000 Points',
      description: 'Accumulate 45,000 production points from issued and paid policies. This is the primary production threshold for Marketing Director (MD) qualification.',
      tab: 'policies',
    },
    {
      key: 'month1_premium',
      label: 'Month 1 — $1,250 Premium',
      description: 'Maintain at least $1,250 in monthly premium production during Month 1. Consistent monthly premium demonstrates sustainable client activity.',
      tab: 'policies',
    },
    {
      key: 'month2_premium',
      label: 'Month 2 — $1,250 Premium',
      description: 'Maintain at least $1,250 in monthly premium production during Month 2.',
      tab: 'policies',
    },
    {
      key: 'month3_premium',
      label: 'Month 3 — $1,250 Premium',
      description: 'Maintain at least $1,250 in monthly premium production during Month 3. Three consecutive months proves you have a repeatable, sustainable business.',
      tab: 'policies',
    },
    {
      key: 'license_net_1',
      label: 'License 1 (Net)',
      description: 'Net License 1 — an active, licensed agent on your team who you directly or indirectly sponsored. Net means they are currently active and producing.',
      tab: 'partners',
    },
    { key: 'license_net_2', label: 'License 2 (Net)', description: 'Net License 2 — a second active licensed agent on your team.', tab: 'partners' },
    { key: 'license_net_3', label: 'License 3 (Net)', description: 'Net License 3 — a third active licensed agent on your team.', tab: 'partners' },
    { key: 'license_net_4', label: 'License 4 (Net)', description: 'Net License 4 — a fourth active licensed agent on your team.', tab: 'partners' },
    {
      key: 'license_net_5',
      label: 'License 5 (Net)',
      description: 'Net License 5 — five active licensed agents on your team. This is the team size required to qualify for Marketing Director.',
      tab: 'partners',
    },
  ],
  5: [
    {
      key: '150k_net_6mo',
      label: '150,000 Net Points in 6 Months',
      description: 'Maintain 150,000 net production points over any consecutive 6-month period. This demonstrates that you are leading a high-performing team, not just an active producer.',
      tab: 'policies',
    },
    {
      key: '1_marketing_director',
      label: '1 Marketing Director',
      description: 'Develop and promote at least one agent from your team to Marketing Director level. Leadership multiplication — not just your own production — defines the EMD path.',
      tab: 'partners',
    },
    { key: 'license_1', label: 'License 1', description: 'Net License 1 of 20 required for EMD — an active licensed agent in your organization.', tab: 'partners' },
    { key: 'license_2', label: 'License 2', description: 'Net License 2 of 20.', tab: 'partners' },
    { key: 'license_3', label: 'License 3', description: 'Net License 3 of 20.', tab: 'partners' },
    { key: 'license_4', label: 'License 4', description: 'Net License 4 of 20.', tab: 'partners' },
    { key: 'license_5', label: 'License 5', description: 'Net License 5 of 20.', tab: 'partners' },
    { key: 'license_6', label: 'License 6', description: 'Net License 6 of 20.', tab: 'partners' },
    { key: 'license_7', label: 'License 7', description: 'Net License 7 of 20.', tab: 'partners' },
    { key: 'license_8', label: 'License 8', description: 'Net License 8 of 20.', tab: 'partners' },
    { key: 'license_9', label: 'License 9', description: 'Net License 9 of 20.', tab: 'partners' },
    { key: 'license_10', label: 'License 10', description: 'Net License 10 of 20 — halfway to EMD team size.', tab: 'partners' },
    { key: 'license_11', label: 'License 11', description: 'Net License 11 of 20.', tab: 'partners' },
    { key: 'license_12', label: 'License 12', description: 'Net License 12 of 20.', tab: 'partners' },
    { key: 'license_13', label: 'License 13', description: 'Net License 13 of 20.', tab: 'partners' },
    { key: 'license_14', label: 'License 14', description: 'Net License 14 of 20.', tab: 'partners' },
    { key: 'license_15', label: 'License 15', description: 'Net License 15 of 20.', tab: 'partners' },
    { key: 'license_16', label: 'License 16', description: 'Net License 16 of 20.', tab: 'partners' },
    { key: 'license_17', label: 'License 17', description: 'Net License 17 of 20.', tab: 'partners' },
    { key: 'license_18', label: 'License 18', description: 'Net License 18 of 20.', tab: 'partners' },
    { key: 'license_19', label: 'License 19', description: 'Net License 19 of 20.', tab: 'partners' },
    {
      key: 'license_20',
      label: 'License 20',
      description: 'Net License 20 of 20 — the final team size requirement for Elite Marketing Director. You have built a true agency.',
      tab: 'partners',
    },
  ],
}

export const PHASE_LABELS: Record<number, { title: string; standard: string; goal: string; description: string; nextStep: string }> = {
  1: {
    title: 'Getting Started',
    standard: '7–21 Day Standard',
    goal: 'License & Onboard',
    description: 'Complete your onboarding trainings, schedule your license exam, and build your first list of business partners. This phase sets the foundation for everything that follows.',
    nextStep: 'Pass your life license exam and submit your fingerprints to move to Phase 2.',
  },
  2: {
    title: 'Field Training',
    standard: 'First 30 Day Standard',
    goal: '10 FTAs + First $1,000',
    description: 'Complete 10 Field Training Appointments with your CFT. Help your first 3 clients, build your direct team, and earn your first $1,000 in commission.',
    nextStep: 'Complete 10 FTAs, earn your Net License, and get your Associate Promotion to advance.',
  },
  3: {
    title: 'Becoming a CFT',
    standard: '45–60 Day Standard',
    goal: 'CFT Certification',
    description: 'Attend CFT In Progress classes and demonstrate you can run appointments independently. This phase qualifies you to train new agents on your team.',
    nextStep: 'Get sign-offs from your trainer, CFT Coordinator, and EMD to unlock Phase 4.',
  },
  4: {
    title: 'MD Focus',
    standard: 'MD Plan',
    goal: '45,000 Points + 5 Licenses',
    description: 'Build your business to Marketing Director level. Hit 45,000 production points, meet monthly premium goals, and develop 5 licensed agents on your team.',
    nextStep: 'Hit your production targets and develop your team to qualify for EMD status.',
  },
  5: {
    title: 'EMD Focus',
    standard: 'EMD Plan',
    goal: '150K Net Points + 20 Licenses',
    description: 'Scale to Elite Marketing Director. Maintain 150,000 net points over 6 months, develop a Marketing Director, and grow your licensed team to 20 agents.',
    nextStep: "You're building a legacy — maintain production and keep growing your leadership team.",
  },
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

// ─── Licensing Checklist ──────────────────────────────────────────────────────
// Items that appear in the Licensing Checklist section (all from Phase 1)
// 'derived' items are computed from other data rather than a PhaseItem row
export const LICENSING_CHECKLIST: {
  key: string
  label: string
  description: string
  phaseItemKey?: string   // maps to a Phase 1 PhaseItem key in DB
  derived?: 'carriers'    // computed from carrier data
}[] = [
  {
    key: 'pre_licensing_course',
    label: 'Pre-Licensing Course',
    description: 'Enroll and complete your state-approved life insurance pre-licensing course. This is required before you can sit for the licensing exam.',
    phaseItemKey: 'licensing_class',
  },
  {
    key: 'schedule_life_exam',
    label: 'Schedule Life Exam',
    description: 'Schedule your life insurance exam date through your state\'s testing provider (typically Pearson VUE or PSI). Book it as soon as you finish pre-licensing.',
    phaseItemKey: 'licensing_class',
  },
  {
    key: 'fingerprints',
    label: 'Fingerprints (If Applicable)',
    description: 'Submit fingerprints at a state-approved location if your state requires it for licensing. Check your state DOI requirements.',
    phaseItemKey: 'fingerprints_apply',
  },
  {
    key: 'apply_to_state',
    label: 'Apply to State',
    description: 'Submit your life insurance license application to your state Department of Insurance. Processing typically takes 2–4 weeks after your fingerprints clear.',
    phaseItemKey: 'fingerprints_apply',
  },
  {
    key: 'submit_to_aff',
    label: 'Submit to AFF',
    description: 'Submit your completed contracting paperwork and license information to AFF. Your recruiter confirms receipt and processes your agent file.',
    phaseItemKey: 'submit_to_aff',
  },
  {
    key: 'ce_courses',
    label: 'CE Courses (AML, Annuity & Ethics)',
    description: 'Complete required Continuing Education courses: Anti-Money Laundering (AML), Annuity Product Training, and Ethics. Required before carrier appointments can be processed.',
    phaseItemKey: 'ce_courses',
  },
  {
    key: 'errors_and_omissions',
    label: 'Errors & Omissions Insurance',
    description: 'Obtain active E&O coverage. Required by most carriers before your appointments can be processed. Must remain current throughout your career.',
    phaseItemKey: 'errors_and_omissions',
  },
  {
    key: 'fully_appointed',
    label: 'Fully Appointed with All Carriers',
    description: 'Receive appointed status with all AFF carriers. This completes your licensing journey and authorizes you to sell products from each carrier.',
    derived: 'carriers',
  },
  {
    key: 'direct_deposit',
    label: 'Set Up Direct Deposit',
    description: 'Connect your bank account to receive commission payments directly. Required before your first policy commission can be paid out.',
    phaseItemKey: 'direct_deposit',
  },
]

// ─── System Progressions ──────────────────────────────────────────────────────
// Career milestone badges — computed from phase items, phase level, and milestones
export const SYSTEM_PROGRESSIONS: {
  key: string
  label: string
  description: string
  // How to determine if achieved — evaluated client-side from AgentData
  achievedWhen: string
}[] = [
  {
    key: 'code_number',
    label: 'Code Number',
    description: 'Assigned your AFF agent code — you\'re officially part of the team.',
    achievedWhen: 'always', // has an agent code
  },
  {
    key: 'client',
    label: 'Client',
    description: 'Helped your first client with a financial solution.',
    achievedWhen: 'phase2_client1_or_policies',
  },
  {
    key: 'pass_license',
    label: 'Pass License',
    description: 'Passed your state life insurance licensing exam.',
    achievedWhen: 'phase1_pass_license_test',
  },
  {
    key: 'business_partner_plan',
    label: 'Business Partner Plan',
    description: 'Completed your Business Marketing Plan with your trainer.',
    achievedWhen: 'phase1_business_marketing_plan',
  },
  {
    key: 'licensed_appointed',
    label: 'Licensed & Appointed',
    description: 'Fully licensed and appointed with at least one carrier.',
    achievedWhen: 'phase2_net_license_and_appointed',
  },
  {
    key: '10_field_trainings',
    label: '10 Field Trainings',
    description: 'Completed all 10 required Field Training Appointments.',
    achievedWhen: 'phase2_fta_10',
  },
  {
    key: 'associate_promotion',
    label: 'Associate Promotion',
    description: 'Officially promoted to Associate level within AFF.',
    achievedWhen: 'phase2_associate_promotion',
  },
  {
    key: 'net_license',
    label: 'Net License',
    description: 'Received and activated your life insurance license.',
    achievedWhen: 'phase2_net_license',
  },
  {
    key: 'cft_in_progress',
    label: 'CFT in Progress',
    description: 'Enrolled in Certified Field Trainer training classes.',
    achievedWhen: 'phase3_cft_classes',
  },
  {
    key: 'certified_field_trainer',
    label: 'Certified Field Trainer',
    description: 'Completed all sign-offs and certified as an AFF Field Trainer.',
    achievedWhen: 'phase3_cft_coordinator_signoff',
  },
  {
    key: 'elite_trainer',
    label: 'Elite Trainer',
    description: 'Recognized as an Elite Trainer with a fully certified team.',
    achievedWhen: 'phase4_any_item',
  },
  {
    key: 'marketing_director',
    label: 'Marketing Director',
    description: 'Achieved Marketing Director rank — 45,000 points and 5 licensed agents.',
    achievedWhen: 'phase4_45k_points',
  },
  {
    key: '50k_watch',
    label: '$50k Watch',
    description: '$50,000 in production — you\'ve earned the AFF watch.',
    achievedWhen: 'milestone_50k_watch',
  },
  {
    key: '100k_ring',
    label: '$100k Ring',
    description: '$100,000 in production — you\'ve earned the AFF ring.',
    achievedWhen: 'milestone_100k_ring',
  },
  {
    key: 'emd',
    label: 'Executive MD',
    description: 'Achieved Elite Marketing Director — the pinnacle of the AFF career path.',
    achievedWhen: 'phase5_150k_net_6mo',
  },
]

// Which phase a carrier becomes available for contracting
// Carriers are locked (greyed out) until the agent reaches that phase
export const CARRIER_UNLOCK_PHASE: Record<string, number> = {
  // Phase 2 — core initial carriers, unlocked when licensed
  'Augustar': 2,
  'ANICO Life': 2,
  'ANICO Annuity': 2,
  'Corebridge Life': 2,
  'Foresters': 2,
  'Mutual of Omaha': 2,
  // Phase 3 — intermediate carriers
  'Lincoln': 3,
  'North American Life': 3,
  'North American Annuity': 3,
  'F&G Life': 3,
  'F&G Annuity': 3,
  // Phase 4 — advanced carriers
  'SILAC': 4,
  'American Equity': 4,
  'Corebridge Annuity': 4,
  'Equitrust': 4,
  // Phase 5 — elite carrier
  'Prudential': 5,
}

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

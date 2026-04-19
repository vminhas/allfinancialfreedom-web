// Phase checklist items, stored as PhaseItem rows per agent
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

export interface PhaseItemAction {
  type: 'navigate-tab' | 'resource-link' | 'inline-form'
  tab?: string
  modal?: string
  resourceKey?: string
  label?: string
}

export interface PhaseItemDef {
  key: string
  label: string
  description: string
  duration?: string
  group?: string
  action?: PhaseItemAction
  coordinatorTopic?: LicensingCoordinatorTopic
}

export interface PhaseGroupDef {
  key: string
  label: string
  icon?: string
  description?: string
  showTrainer?: boolean
}

export const PHASE_GROUPS: Record<number, PhaseGroupDef[]> = {
  1: [
    { key: 'step1', label: 'Step 1: Get Started', icon: 'Rocket', description: 'Licensing, Discord, onboarding, and your first PFR.', showTrainer: true },
    { key: 'step2', label: 'Step 2: Build Your Foundation', icon: 'BookOpen', description: 'Continue onboarding, build your marketing plan, and complete licensing.', showTrainer: true },
    { key: 'step3', label: 'Step 3: Prepare for Field Training', icon: 'Target', description: 'Finish onboarding, master your scripts, and schedule your first 10 appointments.', showTrainer: true },
  ],
  2: [
    { key: 'recruits', label: 'Recruit & Onboard', icon: 'UserPlus', description: 'Recruit and onboard your first 3 direct agents.' },
    { key: 'fta', label: 'Field Training Appointments', icon: 'Target', description: 'Complete 10 live appointments with your CFT trainer.', showTrainer: true },
    { key: 'clients', label: 'Client Milestones', icon: 'Users', description: 'Help your first 3 clients and earn your first $1,000.' },
    { key: 'milestones', label: 'Promotions & Recognition', icon: 'TrendingUp', description: 'Earn your Senior Associate Promotion and Net License.' },
  ],
  3: [
    { key: 'skills', label: 'Independent Skills', icon: 'Phone', description: 'Prove you can run appointments and recruit on your own.' },
    { key: 'products', label: 'Product Mastery', icon: 'Package', description: 'Learn the core AFF product suite inside and out.' },
    { key: 'signoffs', label: 'CFT Sign-Offs', icon: 'CheckCircle', description: 'Get approved by your trainer, coordinator, and EMD.', showTrainer: true },
  ],
  4: [
    { key: 'production', label: 'Production Goals', icon: 'BarChart3', description: 'Hit the production numbers for Marketing Director.' },
    { key: 'team', label: 'Team Building', icon: 'UserPlus', description: 'Build and maintain a team of 5 profitable net licensed agents.' },
  ],
  5: [
    { key: 'leadership', label: 'Leadership Production', icon: 'Crown', description: 'Lead a high-performing organization.' },
    { key: 'org', label: 'Organization Growth', icon: 'Network', description: 'Grow your organization to 20 active licensed agents.' },
  ],
}

export const PHASE_ITEMS: Record<number, PhaseItemDef[]> = {
  1: [
    // Step 1: Get Started
    { key: 'licensing_class', label: 'Licensing Class / Schedule Test', group: 'step1', duration: '20 mins',
      description: "Schedule your pre-licensing course and exam with the licensing coordinator. They'll walk you through the process, help you pick a test date, and answer any questions along the way.",
      coordinatorTopic: 'SCHEDULE_EXAM' },
    { key: 'connect_discord', label: 'Connect Discord', group: 'step1', duration: '15 mins',
      description: 'Join the AFF Discord server and link your account so you get access to your phase training channels, weekly training reminders, and team resources. Use the button below to connect.' },
    { key: 'fast_start_school', label: 'Fast Start School', group: 'step1', duration: '1 Hour',
      description: "A company-wide walkthrough of what to focus on in your first 30 days. Held Saturdays at 11am Eastern. Your trainer will send you the link and details.",
      action: { type: 'resource-link', resourceKey: 'fast_start_link', label: 'Join Fast Start' } },
    { key: 'week1_onboarding', label: 'Onboarding Academy Class 1', group: 'step1', duration: '1 Hour',
      description: "On this meeting your trainer walks you through AFF's flagship products and the reasons behind them. By the end of this meeting you'll understand exactly what you're offering to clients and why it matters." },
    { key: 'pfr', label: 'Personal Financial Review', group: 'step1', duration: '1 Hour',
      description: "Sit down with your trainer for your own Personal Financial Review. This is both a real planning session for your finances and your first hands-on experience with the tool you'll use to help families.",
      action: { type: 'navigate-tab', tab: 'pfr', label: 'Open PFR' } },

    // Step 2: Build Your Foundation
    { key: 'week2_onboarding', label: 'Onboarding Academy Class 2', group: 'step2', duration: '1 Hour',
      description: 'In this meeting you will learn how to build out your referral sources and expand your outreach and learn the benefits of being an Agency Owner.' },
    { key: 'business_marketing_plan', label: 'Business Marketing Plan', group: 'step2', duration: '1 Hour',
      description: 'Meet with your CFT within 24 hours of attending onboarding to build out your Business Marketing list for expansion and your agency plan.' },
    { key: 'pass_license_test', label: 'Pass Life License Test', group: 'step2', duration: '1.5 Hours',
      description: 'Pass your state life insurance exam. The moment you pass, schedule your post-licensing call with the licensing coordinator and your EMD. That is where your next steps get mapped out.',
      coordinatorTopic: 'PASS_POST_LICENSING' },
    { key: 'fingerprints_apply', label: 'Fingerprints + Apply for License', group: 'step2', duration: '10 mins',
      description: 'Schedule your fingerprinting and file your state license application. The licensing coordinator handles this with you.',
      coordinatorTopic: 'FINGERPRINTS_APPLY' },
    { key: 'submit_to_aff', label: 'Submit to GFI', group: 'step2', duration: '5 mins',
      description: 'This is what gets you appointed to all of the different carriers. The licensing coordinator handles the submission for you.',
      coordinatorTopic: 'GFI_APPOINTMENTS' },
    { key: 'ce_courses', label: 'Complete CE Courses (AML, Annuity & Ethics)', group: 'step2', duration: '5 Hours',
      description: 'Complete your Continuing Education courses: AML, Annuity, and Ethics. The licensing coordinator will point you to the provider and help you past any snags.',
      coordinatorTopic: 'CE_COURSES' },
    { key: 'errors_and_omissions', label: 'Errors & Omissions Insurance', group: 'step2', duration: '10 mins',
      description: 'Apply for your Errors & Omissions (E&O) insurance policy. The licensing coordinator walks you through the application.',
      coordinatorTopic: 'EO_INSURANCE' },
    { key: 'direct_deposit', label: 'Set Up Direct Deposit', group: 'step2', duration: '5 mins',
      description: 'Set up direct deposit so your commissions land in your account automatically. The licensing coordinator will help you finish this.',
      coordinatorTopic: 'DIRECT_DEPOSIT' },

    // Step 3: Prepare for Field Training
    { key: 'week3_onboarding', label: 'Onboarding Academy Class 3', group: 'step3', duration: '1 Hour',
      description: "This week you'll start scheduling Field Training Appointments (FTAs) with your Certified Field Trainer." },
    { key: 'master_scripts', label: 'Master Scripts', group: 'step3', duration: '2 Hours',
      description: "Learn the scheduling and presentation scripts you'll use on your Field Training calls. Drill them until they feel natural.",
      action: { type: 'resource-link', resourceKey: 'scripts_presentation', label: 'View scripts' } },
    { key: 'schedule_10_trainings', label: 'Schedule 10 Training Appointments', group: 'step3', duration: '1 Hour',
      description: "Schedule your first 10 Field Training Appointments alongside your trainer. Once these are booked, you're ready to move into Phase 2.",
      action: { type: 'inline-form', modal: 'fta-schedule', label: 'Schedule appointments' } },
  ],
  2: [
    // Recruit & Onboard
    { key: 'direct_1', label: 'Recruit & Onboard Your 1st Agent', group: 'recruits',
      description: 'Sponsor and onboard your first direct agent. Someone you personally recruited who has joined AFF. Building your team starts here.',
      action: { type: 'navigate-tab', tab: 'partners', label: 'Refer an agent' } },
    { key: 'direct_2', label: 'Recruit & Onboard Your 2nd Agent', group: 'recruits',
      description: 'Sponsor and onboard your second direct agent on your team.',
      action: { type: 'navigate-tab', tab: 'partners', label: 'Refer an agent' } },
    { key: 'direct_3', label: 'Recruit & Onboard Your 3rd Agent', group: 'recruits',
      description: 'Sponsor and onboard your third direct agent. Three actives is the foundation of a growing agency.',
      action: { type: 'navigate-tab', tab: 'partners', label: 'Refer an agent' } },

    // Field Training Appointments
    { key: 'fta_1', label: 'Field Training 1 (Spouse / Parents)', group: 'fta', duration: '1 Hour',
      description: 'Your first appointment. Your trainer leads, you observe and take notes. Best to start with family (spouse, parents) in a comfortable setting.',
      action: { type: 'inline-form', modal: 'fta-log', label: 'Log this FTA' } },
    { key: 'fta_2', label: 'Field Training 2', group: 'fta', duration: '1 Hour',
      description: 'Shadow your trainer again but start engaging. Ask one discovery question during the appointment.',
      action: { type: 'inline-form', modal: 'fta-log', label: 'Log this FTA' } },
    { key: 'fta_3', label: 'Field Training 3', group: 'fta', duration: '1 Hour',
      description: 'Start presenting the introduction. Your trainer handles the rest while you build confidence opening conversations.',
      action: { type: 'inline-form', modal: 'fta-log', label: 'Log this FTA' } },
    { key: 'fta_4', label: 'Field Training 4', group: 'fta', duration: '1 Hour',
      description: 'Focus on objection handling. Your trainer will let some common objections come to you naturally during the appointment.',
      action: { type: 'inline-form', modal: 'fta-log', label: 'Log this FTA' } },
    { key: 'fta_5', label: 'Field Training 5', group: 'fta', duration: '1 Hour',
      description: 'Halfway mark. You should be presenting about 50% of the appointment. Your trainer fills in the gaps and coaches in real time.',
      action: { type: 'inline-form', modal: 'fta-log', label: 'Log this FTA' } },
    { key: 'fta_6', label: 'Field Training 6', group: 'fta', duration: '1 Hour',
      description: 'Take the lead on most of the presentation. Your trainer coaches from the side and only steps in when needed.',
      action: { type: 'inline-form', modal: 'fta-log', label: 'Log this FTA' } },
    { key: 'fta_7', label: 'Field Training 7', group: 'fta', duration: '1 Hour',
      description: 'Run the full needs analysis and product recommendation. Your trainer observes and gives feedback after the appointment.',
      action: { type: 'inline-form', modal: 'fta-log', label: 'Log this FTA' } },
    { key: 'fta_8', label: 'Field Training 8', group: 'fta', duration: '1 Hour',
      description: 'Lead the entire appointment from start to finish. Your trainer is there as backup but lets you run the show.',
      action: { type: 'inline-form', modal: 'fta-log', label: 'Log this FTA' } },
    { key: 'fta_9', label: 'Field Training 9', group: 'fta', duration: '1 Hour',
      description: 'Almost there. Run the full appointment solo with your trainer observing. Focus on closing the case naturally.',
      action: { type: 'inline-form', modal: 'fta-log', label: 'Log this FTA' } },
    { key: 'fta_10', label: 'Field Training 10', group: 'fta', duration: '1 Hour',
      description: 'Your final FTA. Demonstrate full independence. Your trainer is there for backup only. Completing all 10 FTAs means you are ready to run appointments on your own.',
      action: { type: 'inline-form', modal: 'fta-log', label: 'Log this FTA' } },

    // Client Milestones
    { key: 'client_1', label: 'Help Your 1st Client (Policy Issued)', group: 'clients',
      description: 'Help your first client. Complete a full financial needs analysis and present a real solution. Document the case in your Policies tab.',
      action: { type: 'navigate-tab', tab: 'policies', label: 'Log a policy' } },
    { key: 'client_2', label: 'Help Your 2nd Client', group: 'clients',
      description: 'Help your second client. Each client you serve builds your experience and your track record.',
      action: { type: 'navigate-tab', tab: 'policies', label: 'Log a policy' } },
    { key: 'client_3', label: 'Help Your 3rd Client', group: 'clients',
      description: 'Help your third client. Three cases demonstrates consistent client service, a major milestone.',
      action: { type: 'navigate-tab', tab: 'policies', label: 'Log a policy' } },

    // Promotions & Recognition
    { key: 'associate_promotion', label: 'Senior Associate Promotion', group: 'milestones',
      description: "Officially promoted to Senior Associate level within AFF. This recognizes your completion of Phase 1 requirements and confirms you're ready for independent field work." },
    { key: 'first_1000', label: "Net License — Make Your 1st $1,000", group: 'milestones',
      description: 'Earn your first $1,000 in commission from issued and paid policies. This is your net license milestone and proves the system works. It is just the start of what is possible.',
      action: { type: 'navigate-tab', tab: 'policies', label: 'View policies' } },
  ],
  3: [
    // CFT Sign-Offs
    { key: 'cft_classes', label: 'Attend CFT in Progress Classes', group: 'signoffs', duration: '1 Hour',
      description: 'Attend CFT (Certified Field Trainer) In Progress sessions hosted by AFF leadership. These are the advanced classes that teach you how to train and develop new agents.',
      },
    { key: 'trainer_signoff', label: 'Signed Off by Trainer', group: 'signoffs',
      description: 'Your CFT trainer officially signs off that you can run appointments independently and are ready to begin training others. This is a formal milestone in your development.',
      },
    { key: 'cft_coordinator_signoff', label: 'CFT Coordinator Sign Off', group: 'signoffs',
      description: 'The CFT Coordinator, a senior AFF trainer, reviews your performance and approves your readiness for CFT designation.' },
    { key: 'emd_signoff', label: 'EMD Sign Off', group: 'signoffs',
      description: 'The Executive Marketing Director reviews and signs off on your CFT designation. This is the final approval before you advance to Phase 4.' },

    // Independent Skills
    { key: 'client_1st_apt', label: 'Solo Client 1st Appointment', group: 'skills',
      description: 'Run a complete first client appointment independently. Conduct the financial needs analysis and present solutions without your trainer present.',
      action: { type: 'navigate-tab', tab: 'policies', label: 'Log a policy' } },
    { key: 'client_2nd_apt', label: 'Solo Client 2nd Appointment', group: 'skills',
      description: 'Run the follow-up (second) appointment independently. Complete a PFR, present personalized solutions, and close the case on your own.',
      action: { type: 'navigate-tab', tab: 'policies', label: 'Log a policy' } },
    { key: 'phone_call_scripts', label: 'Phone Call Scripts', group: 'skills',
      description: 'Master all phone scripts: reference call script, ETHOR call script, recruiting calls, and follow-up calls. Demonstrate the ability to set quality appointments via phone alone.',
      action: { type: 'resource-link', resourceKey: 'scripts_phone', label: 'View call scripts' } },
    { key: 'recruiting_interview', label: 'Recruiting Interview', group: 'skills',
      description: 'Conduct a full recruiting interview with a prospective agent candidate using the official AFF interview process.',
      action: { type: 'navigate-tab', tab: 'partners', label: 'Log interview' } },
    { key: 'system_knowledge', label: 'System Knowledge', group: 'skills',
      description: 'Demonstrate comprehensive knowledge of the full AFF system: the business model, compensation structure, agent career path, and how to explain it to prospects.' },

    // Product Mastery
    { key: 'top_5_products', label: 'Top 5 Products', group: 'products',
      description: 'Develop working knowledge of the top 5 AFF products. You must be able to identify which product fits each client scenario and explain the core benefits clearly.' },
    { key: 'fixed_indexed_annuity', label: 'Fixed Indexed Annuity', group: 'products',
      description: 'Complete product certification on Fixed Indexed Annuities (FIA). Tax-deferred retirement vehicles with upside tied to a market index and downside protection.' },
    { key: 'final_expense', label: 'Final Expense', group: 'products',
      description: 'Complete training on Final Expense products. Simplified-issue permanent life insurance designed to cover end-of-life costs. A key product for the senior market.' },
    { key: 'term_lb', label: 'Term / Term LB', group: 'products',
      description: 'Complete product training on Term Life and Term with Living Benefits. Understand when to recommend pure term vs. term with critical illness or chronic illness riders.' },
    { key: 'iul_family_bank', label: 'IUL / Family Bank', group: 'products',
      description: "Master the Indexed Universal Life (IUL) / Family Bank strategy. AFF's signature wealth-building product. Clients use it to build tax-free retirement income and a family legacy." },
    { key: 'million_dollar_baby', label: 'Million Dollar Baby', group: 'products',
      description: 'Complete training on the Million Dollar Baby strategy. An IUL funded for infants or children that grows into a tax-advantaged wealth vehicle over their lifetime.' },
  ],
  4: [
    // Production Goals
    { key: '45k_points', label: '45,000 Points', group: 'production',
      description: 'Accumulate 45,000 production points from issued and paid policies. This is the primary production threshold for Marketing Director (MD) qualification.',
      action: { type: 'navigate-tab', tab: 'policies', label: 'View policies' } },
    { key: 'month1_premium', label: 'Month 1: $1,250 Premium', group: 'production',
      description: 'Maintain at least $1,250 in monthly premium production during Month 1. Consistent monthly premium demonstrates sustainable client activity.',
      action: { type: 'navigate-tab', tab: 'policies', label: 'View policies' } },
    { key: 'month2_premium', label: 'Month 2: $1,250 Premium', group: 'production',
      description: 'Maintain at least $1,250 in monthly premium production during Month 2.',
      action: { type: 'navigate-tab', tab: 'policies', label: 'View policies' } },
    { key: 'month3_premium', label: 'Month 3: $1,250 Premium', group: 'production',
      description: 'Maintain at least $1,250 in monthly premium production during Month 3. Three consecutive months proves you have a repeatable, sustainable business.',
      action: { type: 'navigate-tab', tab: 'policies', label: 'View policies' } },

    // Team Building
    { key: 'license_net_1', label: 'Net Licensed Agent 1', group: 'team',
      description: 'An active, licensed agent on your team who you directly or indirectly sponsored. Net means they are currently active and producing.',
      action: { type: 'navigate-tab', tab: 'partners', label: 'View team' } },
    { key: 'license_net_2', label: 'Net Licensed Agent 2', group: 'team',
      description: 'A second active licensed agent on your team.',
      action: { type: 'navigate-tab', tab: 'partners', label: 'View team' } },
    { key: 'license_net_3', label: 'Net Licensed Agent 3', group: 'team',
      description: 'A third active licensed agent on your team.',
      action: { type: 'navigate-tab', tab: 'partners', label: 'View team' } },
    { key: 'license_net_4', label: 'Net Licensed Agent 4', group: 'team',
      description: 'A fourth active licensed agent on your team.',
      action: { type: 'navigate-tab', tab: 'partners', label: 'View team' } },
    { key: 'license_net_5', label: 'Net Licensed Agent 5', group: 'team',
      description: 'Five active licensed agents on your team. This is the team size required to qualify for Marketing Director.',
      action: { type: 'navigate-tab', tab: 'partners', label: 'View team' } },
  ],
  5: [
    // Leadership Production
    { key: '150k_net_6mo', group: 'leadership',
      label: '150,000 Net Points in 6 Months',
      description: 'Maintain 150,000 net production points over any consecutive 6-month period. This demonstrates that you are leading a high-performing team, not just an active producer.',
      action: { type: 'navigate-tab', tab: 'policies', label: 'View policies' } },
    { key: '1_marketing_director', group: 'leadership',
      label: '1 Marketing Director',
      description: 'Develop and promote at least one agent from your team to Marketing Director level. Leadership multiplication, not just your own production, defines the EMD path.',
      action: { type: 'navigate-tab', tab: 'partners', label: 'View your MDs' } },
    { key: '100k_income', group: 'leadership',
      label: '$100,000 a Year in Income',
      description: 'Reach $100,000 in annual income from commissions and overrides. This milestone represents a sustainable, full-time career in financial services.',
      action: { type: 'navigate-tab', tab: 'policies', label: 'View policies' } },

    // Organization Growth
    { key: 'license_1', label: 'Organization License 1', group: 'org', description: 'Net License 1 of 20 required for EMD, an active licensed agent in your organization.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_2', label: 'Organization License 2', group: 'org', description: 'Net License 2 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_3', label: 'Organization License 3', group: 'org', description: 'Net License 3 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_4', label: 'Organization License 4', group: 'org', description: 'Net License 4 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_5', label: 'Organization License 5', group: 'org', description: 'Net License 5 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_6', label: 'Organization License 6', group: 'org', description: 'Net License 6 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_7', label: 'Organization License 7', group: 'org', description: 'Net License 7 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_8', label: 'Organization License 8', group: 'org', description: 'Net License 8 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_9', label: 'Organization License 9', group: 'org', description: 'Net License 9 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_10', label: 'Organization License 10', group: 'org', description: 'Net License 10 of 20, halfway to EMD team size.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_11', label: 'Organization License 11', group: 'org', description: 'Net License 11 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_12', label: 'Organization License 12', group: 'org', description: 'Net License 12 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_13', label: 'Organization License 13', group: 'org', description: 'Net License 13 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_14', label: 'Organization License 14', group: 'org', description: 'Net License 14 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_15', label: 'Organization License 15', group: 'org', description: 'Net License 15 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_16', label: 'Organization License 16', group: 'org', description: 'Net License 16 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_17', label: 'Organization License 17', group: 'org', description: 'Net License 17 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_18', label: 'Organization License 18', group: 'org', description: 'Net License 18 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_19', label: 'Organization License 19', group: 'org', description: 'Net License 19 of 20.', action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
    { key: 'license_20', label: 'Organization License 20', group: 'org',
      description: 'Net License 20 of 20, the final team size requirement for Elite Marketing Director. You have built a true agency.',
      action: { type: 'navigate-tab', tab: 'partners', label: 'View organization' } },
  ],
}

export const PHASE_LABELS: Record<number, { title: string; standard: string; goal: string; description: string; nextStep: string }> = {
  1: {
    title: 'Getting Started',
    standard: '7-21 Day Standard',
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
    standard: '45-60 Day Standard',
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
    nextStep: "You're building a legacy, maintain production and keep growing your leadership team.",
  },
}

// Discord roles per phase, guild role IDs stored in Settings table
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
    description: 'Submit your life insurance license application to your state Department of Insurance. Processing typically takes 2-4 weeks after your fingerprints clear.',
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
// Career milestone badges, computed from phase items, phase level, and milestones
export const SYSTEM_PROGRESSIONS: {
  key: string
  label: string
  description: string
  // How to determine if achieved, evaluated client-side from AgentData
  achievedWhen: string
}[] = [
  {
    key: 'code_number',
    label: 'Code Number',
    description: 'Assigned your AFF agent code, you\'re officially part of the team.',
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
    description: 'Earned your first $1,000 in commission from issued and paid policies.',
    achievedWhen: 'phase2_first_1000',
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
    description: 'Achieved Marketing Director rank, 45,000 points and 5 licensed agents.',
    achievedWhen: 'phase4_45k_points',
  },
  {
    key: '50k_watch',
    label: '$50k Watch',
    description: '$50,000 in production, you\'ve earned the AFF watch.',
    achievedWhen: 'milestone_50k_watch',
  },
  {
    key: '100k_ring',
    label: '$100k Ring',
    description: '$100,000 in production, you\'ve earned the AFF ring.',
    achievedWhen: 'milestone_100k_ring',
  },
  {
    key: 'emd',
    label: 'Executive MD',
    description: 'Achieved Elite Marketing Director, the pinnacle of the AFF career path.',
    achievedWhen: 'phase5_150k_net_6mo',
  },
]

// Which phase a carrier becomes available for contracting
// Carriers are locked (greyed out) until the agent reaches that phase
export const CARRIER_UNLOCK_PHASE: Record<string, number> = {
  // Phase 2, core initial carriers, unlocked when licensed
  'Augustar': 2,
  'ANICO Life': 2,
  'ANICO Annuity': 2,
  'Corebridge Life': 2,
  'Foresters': 2,
  'Mutual of Omaha': 2,
  // Phase 3, intermediate carriers
  'Lincoln': 3,
  'North American Life': 3,
  'North American Annuity': 3,
  'F&G Life': 3,
  'F&G Annuity': 3,
  // Phase 4, advanced carriers
  'SILAC': 4,
  'American Equity': 4,
  'Corebridge Annuity': 4,
  'Equitrust': 4,
  // Phase 5, elite carrier
  'Prudential': 5,
}

// At-risk thresholds: days in phase + max % complete before flagged
export const PHASE_EXPECTED_DAYS: Record<number, number> = {
  1: 14, 2: 30, 3: 52,
}

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

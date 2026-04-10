export const IMAGES = {
  logo: 'https://images.squarespace-cdn.com/content/v1/681101f55b106572fa6b7718/206e8496-0da1-4777-a74d-02f2784a5035/Company+Logo+White.png?format=1500w',
  heroBg: 'https://images.squarespace-cdn.com/content/v1/681101f55b106572fa6b7718/1747247654094-M440Q5FVHA2EYXLQKQRD/unsplash-image-ZYY2lNM-J1Y.jpg',
  strip1: 'https://images.squarespace-cdn.com/content/v1/681101f55b106572fa6b7718/f752d5b1-bf53-4ebf-935d-87530ec1662d/pexels-sagui-andrea-200115-618833.jpg',
  strip2: 'https://images.squarespace-cdn.com/content/v1/681101f55b106572fa6b7718/408de877-03f2-4351-8680-78162b2e6baf/pexels-cottonbro-7232037.jpg',
  strip3: 'https://images.squarespace-cdn.com/content/v1/681101f55b106572fa6b7718/b451a0f8-aacd-4f57-9d1f-f340ab9646d3/pexels-karolina-grabowska-7876672.jpg',
  wealthGap: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&q=90&fm=jpg&fit=crop',
  vick: '/team/vick.jpg',
  melinee: '/team/melinee.jpg',
  jeremy: '/team/jeremy.jpg',
  movement: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1600&q=90&fm=jpg&fit=crop',
}

export const GHL_BOOKING_URL = 'https://api.leadconnectorhq.com/widget/booking/ZOedxdwvtOnTS6Sg5n7Z'
export const GHL_FORM_EMBED_SRC = 'https://link.msgsndr.com/js/form_embed.js'

// Only Vick and Melinee on the team page
export const TEAM = [
  {
    name: 'Karmvir "Vick" Minhas',
    title: 'Chief Executive Officer',
    credentials: 'MBA, EMD',
    image: IMAGES.vick,
    bio: 'With over 16 years of experience in the financial services industry, Vick brings a powerful blend of expertise, vision, and unwavering dedication to our mission. A natural educator and driven leader, he\'s passionate about breaking down complex financial concepts into actionable strategies that create long-term success.',
  },
  {
    name: 'Melinee Minhas',
    title: 'Chief Operations Officer',
    credentials: 'MBA, EMD',
    image: IMAGES.melinee,
    bio: 'Driven by purpose and powered by strategy, Melinee brings heart, hustle, and vision to every financial journey. As COO, she\'s the steady hand behind our systems, making sure every client and partner feels seen, supported, and set up to win.',
  },
]

export const DIRECTORS = [
  {
    name: 'Dr. Jeremy Davis',
    title: 'Marketing Director',
    credentials: 'PhD',
    image: IMAGES.jeremy,
    bio: 'Dr. Davis brings a rare combination of academic depth and real-world marketing insight to the All Financial Freedom team. His strategic approach to brand building, community outreach, and client education helps ensure our message reaches the families who need it most.',
    calendly: 'https://calendly.com/davisfamilyfinancial/discoverycall',
  },
]

export const ASSOCIATES = [
  { name: 'Kiirah Washington', initials: 'KW', specialty: 'Insurance Planning', location: 'Houston, TX', image: '/team/kiirah.jpg', calendly: 'https://calendly.com/k-washington1-gfi/30min' },
  { name: 'Doug Morrison', initials: 'DM', specialty: 'Wealth Building', location: 'Dallas, TX', image: '/team/doug.jpg', calendly: 'https://calendly.com/dougmorrison-gfi/gfi-discovery-phone-call-clone' },
  { name: 'Heather Cullum', initials: 'HC', specialty: 'Retirement Planning', location: 'Charlotte, NC', image: '/team/heather.jpg' },
  { name: 'Sam Yonce', initials: 'SY', specialty: 'Asset Protection', location: 'Phoenix, AZ', image: '/team/sam.jpg', calendly: 'https://calendly.com/syonce61/new-meeting' },
  { name: 'Sadie Grubb', initials: 'SG', specialty: 'Financial Planning', location: 'Centerville, IA', image: '/team/sadie.jpg', calendly: 'https://calendly.com/sadiegrubb/future-planning-call' },
]

export const GHL_JOIN_FORM_URL = '' // Add your GHL join/team-prospect form embed URL here

export const SERVICES = [
  {
    title: 'Wealth Building',
    icon: 'layers',
    description: 'Strategic investment guidance and wealth accumulation plans tailored to your income, goals, and timeline.',
    bullets: ['Investment strategy & portfolio guidance', 'Index funds, annuities & alternatives', 'Long-term wealth accumulation'],
  },
  {
    title: 'Asset Protection',
    icon: 'shield',
    description: 'Safeguard what you\'ve built with comprehensive protection strategies designed to shield your family from life\'s unexpected events.',
    bullets: ['Risk assessment & management', 'Business & personal asset shielding', 'Liability coverage strategies'],
  },
  {
    title: 'Insurance Planning',
    icon: 'check-square',
    description: 'Life, health, and disability insurance solutions that give you and your loved ones complete peace of mind.',
    bullets: ['Term & whole life insurance', 'Indexed universal life (IUL)', 'Disability & income protection'],
  },
  {
    title: 'Budgeting & Planning',
    icon: 'dollar-sign',
    description: 'Practical budgeting frameworks and financial plans that transform everyday spending decisions into long-term wealth-building habits.',
    bullets: ['Cash flow analysis & optimization', 'Debt elimination strategies', 'Emergency fund & savings planning'],
  },
  {
    title: 'Retirement Planning',
    icon: 'clock',
    description: 'Chart your path to retirement with strategies that maximize your savings, minimize taxes, and secure the lifestyle you\'ve worked hard to achieve.',
    bullets: ['401(k), IRA & Roth optimization', 'Social Security maximization', 'Income distribution strategies'],
  },
  {
    title: 'Legacy Planning',
    icon: 'users',
    description: 'Build a lasting legacy through estate planning, generational wealth strategies, and giving structures that preserve your impact.',
    bullets: ['Estate planning & will guidance', 'Generational wealth transfer', 'Charitable giving strategies'],
  },
  {
    title: 'Mortgage Protection',
    icon: 'home',
    description: 'Your home is likely your largest asset. Mortgage protection ensures your family keeps it, no matter what happens to your income.',
    bullets: ['Mortgage payoff protection', 'Income replacement coverage', 'Disability & critical illness riders'],
  },
  {
    title: 'Business Owner Strategies',
    icon: 'briefcase',
    description: 'Business owners face unique financial risks and opportunities. We build strategies that protect your business, reward key employees, and create an exit plan.',
    bullets: ['Buy-sell agreement funding', 'Key person insurance', 'Executive bonus & deferred comp plans'],
  },
  {
    title: 'Family Banking',
    icon: 'bank',
    description: 'Use whole life insurance to create your own private banking system, borrow against your cash value, pay yourself back, and build wealth without Wall Street.',
    bullets: ['Infinite banking concept (IBC)', 'Tax-free cash value growth', 'Self-directed family liquidity'],
  },
  {
    title: 'Kids Head Start Plans',
    icon: 'star',
    description: 'Give your children a financial head start that most adults never had. Start their wealth-building journey early with guaranteed growth and lifelong coverage.',
    bullets: ['Juvenile whole life policies', 'Locked-in insurability for life', 'Cash value for college or first home'],
  },
]

export const TESTIMONIALS = [
  { text: 'Working with All Financial Freedom completely changed how I think about money. For the first time, I have a real plan, not just a savings account. Within 6 months I paid off $18,000 in debt and started building real wealth.', name: 'Marcus J.', meta: 'Small Business Owner · Atlanta, GA', initials: 'MJ' },
  { text: 'Vick and the team took the time to actually understand my situation. No jargon, no pressure, just real guidance. I now have a life insurance policy and a retirement strategy I actually understand and believe in.', name: 'Tanya W.', meta: 'Registered Nurse · Dallas, TX', initials: 'TW' },
  { text: 'I thought financial planning was only for wealthy people. All Financial Freedom showed me that\'s exactly backwards, planning is how you become wealthy. Game changer for my whole family.', name: 'David R.', meta: 'Teacher · Chicago, IL', initials: 'DR' },
  { text: 'I\'m a first-generation wealth builder and I had so many questions. The patience and knowledge this team brings is unreal. Couldn\'t be more grateful.', name: 'Amara P.', meta: 'Entrepreneur · Houston, TX', initials: 'AP' },
  { text: 'Our family now has a full financial roadmap, protection, retirement, and a legacy plan for our kids. We sleep better at night knowing we\'re covered.', name: 'Kevin & Sandra L.', meta: 'Couple · Phoenix, AZ', initials: 'KS' },
  { text: 'I\'ve worked with other financial advisors before and always felt like a number. Here I felt like a priority. They asked about my goals, my family, my fears, and built a plan around all of it.', name: 'Nicole B.', meta: 'Corporate Executive · Los Angeles, CA', initials: 'NB' },
]

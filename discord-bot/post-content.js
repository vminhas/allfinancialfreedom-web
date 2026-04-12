// AFF Concierge - Post polished branded content to all channels
// Deletes old personal messages and replaces with clean embeds
// node discord-bot/post-content.js

require('./load-env');
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require('discord.js');
const { GUILD_ID, COLORS } = require('./config');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Message IDs to delete (old personal posts)
const DELETE_MESSAGES = {
  '1295044213590982720': ['1300568858616266824'], // welcome
  '1295044213590982721': ['1300568956754722846', '1300569061276516373'], // rules
  '1295044213754564615': ['1300566266091667509'], // phase-1-focus
  '1295044213754564616': ['1300546583481421906', '1487951075012120676'], // phase-1-step-1
  '1295044213754564617': ['1300558092169252954'], // phase-1-step-2
  '1295044213930459186': ['1300602534380961813'], // phase-1-step-3
  '1295044213930459187': ['1300602799691923537'], // phase-2-focus
  '1295044213930459188': ['1300602883087011912', '1302755294086168647'], // phase-3-focus
  '1295044213930459189': ['1300602975361830983', '1300620492641800252'], // phase-4-focus
  '1295044213590982726': ['1300600900242640956', '1300600939727814707', '1300600974620098661', '1300601196717015172', '1301265982341517342', '1373378001265229875'], // biztools-101
  '1295044213590982727': ['1300601374366633994', '1300619373312081970', '1319422875379306557', '1455249886156161125'], // trainer-calendlys
  '1295044213590982728': ['1300601569238188042', '1300601596123549779', '1300601633490599978', '1300619157607546901', '1304834868756348959', '1325467906204631061'], // presentations
};

// Channel content to post
const CHANNEL_POSTS = {

  // ── WELCOME ──────────────────────────────────────────────────────────────────
  '1295044213590982720': [
    new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle('Welcome to All Financial Freedom')
      .setDescription('We\'re thrilled to have you here. This server is your home base for training, resources, and community as you build your business with us.\n\n*Wealth · Protection · Legacy*')
      .addFields(
        { name: '📋 Step 1', value: 'Read <#1295044213590982721> to understand our team standards.' },
        { name: '📅 Step 2', value: 'Book your orientation calls — links are in <#1295044213754564616>.' },
        { name: '📆 Team Weekly Schedule', value: '[View Schedule](https://docs.google.com/spreadsheets/d/1q5AJXX13ybfIfLReCpZv_pXtmVSLBqdvd9YRR8xVEq0/edit?gid=992495938#gid=992495938)' },
        { name: '📆 GFI Training Schedule', value: '[View Schedule](https://docs.google.com/spreadsheets/d/e/2PACX-1vSzNZojPjvZAFULHRvAkirOl05PZV-kdFyiuv3gfS1zVLoN0CidxfNpz5VSk6a5AUFEe1kTqUXSeQxH/pubhtml?gid=0&single=true)' },
        { name: '🎬 Introduction Video', value: '[Watch Now](https://drive.google.com/file/d/19IDHBpLrwKDUNd3KXBTCL2ta_Sn38bt-/view?usp=sharing)' },
        { name: '🌐 Our Website', value: '[allfinancialfreedom.com](https://allfinancialfreedom.com) — articles, resources, and tools for your clients.' },
      )
      .setFooter({ text: 'All Financial Freedom — Building a future you feel confident in.' }),
  ],

  // ── RULES ────────────────────────────────────────────────────────────────────
  '1295044213590982721': [
    new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle('Community Standards')
      .setDescription('This server is a professional workspace and community. We are here to grow together, support each other, and build businesses that change lives.\n\n**Our Mission: No Family Left Behind.**')
      .addFields(
        { name: '💬 Golden Rule', value: 'All official communication happens in Discord. Text messages, personal calls, and external platforms are not recognized during work hours.' },
        { name: '🪪 Display Name Format', value: '`First Name Last Name - AgentID`\nPlease update your nickname to match this format.' },
        { name: '⚠️ Consequences', value: '3 warnings before removal. Disrespect or rule violations will result in a kick or ban.' },
      )
      .setFooter({ text: 'All Financial Freedom · Wealth · Protection · Legacy' }),
    new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle('Team Guidelines')
      .addFields(
        { name: '🚫 No Self-Promotion', value: 'No promotion of outside businesses, services, or Discord servers.' },
        { name: '📌 Post in the Right Channel', value: 'Keep conversations relevant to the channel topic.' },
        { name: '🤝 Stay Professional', value: 'We are a positive, growth-focused environment. Respect everyone at all times.' },
        { name: '🚫 No Spam', value: 'No gibberish, custom code requests, or off-topic flooding.' },
      )
      .setFooter({ text: 'All Financial Freedom · Wealth · Protection · Legacy' }),
  ],

  // ── PHASE 1 FOCUS ────────────────────────────────────────────────────────────
  '1295044213754564615': [
    new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle('Phase 1 — Building Your Foundation')
      .setDescription('Phase 1 is where you lay the groundwork for your business. Get licensed, set up with top carriers, learn our systems, understand our products, and build toward your first promotion.\n\nThis phase is broken into **3 structured steps**, each designed to move you forward.')
      .addFields(
        { name: '📁 Full Phase 1 Folder', value: '[Open Drive Folder](https://drive.google.com/drive/folders/1dFC_4Q62q5uCEOXtUdSlJTEGCUwjIggI?usp=drive_link)' },
        { name: '▶️ Step 1 — Setup & Foundation', value: 'Get fully plugged in. Complete onboarding, schedule key calls, and set up your tools.\n[Open Step 1 Folder](https://drive.google.com/drive/folders/1hjGa_LbidtcNtpIeWPnl2VV8ntEOopW8?usp=drive_link)' },
        { name: '▶️ Step 2 — Execution & Momentum', value: 'Pass your exam or complete post-licensing onboarding. Build consistency through trainings and daily activity.\n[Open Step 2 Folder](https://drive.google.com/drive/folders/14AV6R4mZb5ZqK4G8TUmal9Gl-j5OCiyc?usp=drive_link)' },
        { name: '▶️ Step 3 — Preparation & Confidence', value: 'Learn communication frameworks, prepare for live field training, and get polished.\n[Open Step 3 Folder](https://drive.google.com/drive/folders/1b5ddPCiGKq5eWSg2nKlKv-FqWeK9NNzu?usp=drive_link)' },
        { name: '⏱️ Timeline', value: 'Phase 1 can typically be completed in **10–14 days** on a fast track.' },
        { name: '💡 Pro Tip', value: 'Stay in close communication with your trainer throughout this phase. This is your foundation for long-term, passive income.' },
      )
      .setFooter({ text: 'All Financial Freedom · Wealth · Protection · Legacy' }),
  ],

  // ── PHASE 1 STEP 1 ───────────────────────────────────────────────────────────
  '1295044213754564616': [
    new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle('Phase 1 — Step 1: Setup & Foundation')
      .setDescription('This is your official starting point. Get set up, plugged in, and ready to build with clarity.')
      .addFields(
        { name: '📧 Step 1', value: 'Find your welcome email titled **"Welcome to the GFI Family."** Check spam if needed. This contains your next steps.' },
        { name: '🎬 Step 2', value: '[Watch the Intro Onboarding Video](https://drive.google.com/file/d/1x_QY4zjTV8JHq6fQuexqgFE3N_31p63T/view?usp=drive_link) to understand how we operate.' },
        { name: '📅 Step 3 — Book Your Calls Within 24–48 Hours', value: '[Meet & Greet with Melinee Minhas](https://calendly.com/melineeminhas/meetandgreet)\n[Meet & Greet with Vick Minhas](https://calendly.com/vickminhas/meet-and-greet)\n[Licensing Coordinator](https://calendly.com/empower-licensing-gfi/licensing-orientation-empower-team)' },
        { name: '🪪 Step 4 — Professional Setup', value: 'Create a professional headshot and a GFI-dedicated email address. Share both with your trainer, your EMD, and the licensing coordinator.' },
        { name: '📋 Step 5 — Review Your APT', value: 'Your Associate Progress Tracker (APT) outlines your Week 1 actions. It will arrive from empower.licensing.gfi@gmail.com' },
        { name: '📚 Product Clarity Videos', value: '[IUL Basics](https://www.youtube.com/watch?v=wX89Rk5pr6A) · [Million Dollar Baby](https://www.youtube.com/watch?v=gIieZrg3_UE&feature=youtu.be) · [FIAs](https://www.youtube.com/watch?v=FBuc3gYyFK8) · [Swiss Army Knife](https://wealthwave.com/videos/swiss-army-knife-of-financial-strategies)' },
        { name: '📖 Required Reading', value: '[Money Wealth Life Insurance](https://drive.google.com/file/d/1E2GnEulWaZojiPNOhhTcSHM7KNgwOqgJ/view)' },
        { name: '✅ When Complete', value: 'Check off your APT boxes and notify your trainer to unlock **Step 2**.' },
      )
      .setFooter({ text: 'All Financial Freedom · Wealth · Protection · Legacy' }),
  ],

  // ── PHASE 1 STEP 2 ───────────────────────────────────────────────────────────
  '1295044213754564617': [
    new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle('Phase 1 — Step 2: Execution & Momentum')
      .setDescription('You\'ve completed your foundation. Now shift into action, consistency, and forward momentum.')
      .addFields(
        { name: '🎬 Step 2 Training Video', value: '[Watch Phase 1 Part 2](https://drive.google.com/file/d/1oxyju_RlNVAayEm2UUQqJPV1_lAY8ILB/view?usp=drive_link) · [Open Folder](https://drive.google.com/drive/folders/1P9hwNQHvr61436G7yTI6FgXrkNamiLx4?usp=drive_link)' },
        { name: '📝 If Not Yet Licensed', value: 'Your priority is preparing for and passing your state exam as quickly as possible.' },
        { name: '📝 If Already Licensed', value: 'Complete post-licensing onboarding:\n[Post-Licensing Call with Vick](https://calendly.com/vickminhas/postlicensingmeeting)\n[Licensing Coordinator Next Steps](https://calendly.com/empower-licensing-gfi/licensing-orientation-empower-team)' },
        { name: '💼 Complete Your PFR', value: 'Your Personal Financial Review is your first real experience serving families. Build confidence and align your own financial foundation.' },
        { name: '📆 Required Weekly Trainings', value: '**Monday** 8PM EST — Systems Training\n**Thursday** 8PM EST — Product Training' },
        { name: '📆 Highly Suggested Trainings', value: '**Momentum Monday** 12PM EST\n**Winning Wednesday** 3PM EST' },
        { name: '✅ When Complete', value: 'Check off your APT and connect with your trainer to move into **Step 3**.' },
      )
      .setFooter({ text: 'The more you show up, the faster you grow. · All Financial Freedom' }),
  ],

  // ── PHASE 1 STEP 3 ───────────────────────────────────────────────────────────
  '1295044213930459186': [
    new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle('Phase 1 — Step 3: Preparation & Confidence')
      .setDescription('Congratulations on passing your exam! This is where everything comes together. You\'ll prepare for real conversations and live field training.')
      .addFields(
        { name: '🎬 Step 3 Training Video', value: '[Watch Phase 1 Part 3](https://drive.google.com/file/d/1YAzXzHwrY9Z7H82NJtYJ4Mi7tBiGTjU8/view?usp=drive_link) · [Open Folder](https://drive.google.com/drive/folders/1NiAugYiTxqDLh1awj5aNJ2cFASTfQjld?usp=drive_link)' },
        { name: '🎓 Complete Onboarding 3', value: 'Your final onboarding with your trainer — designed to prepare you for stepping into an active role.' },
        { name: '🗣️ Build Communication Skills', value: 'Learn core [scripts and frameworks](https://drive.google.com/drive/folders/1Iah5vZd3j_9crOZJvh62RxTNEgL-4ei4?usp=drive_link) — not to sound scripted, but to communicate clearly and naturally.' },
        { name: '🎥 Professional Presence', value: '[Zoom Etiquette Video](https://www.youtube.com/watch?v=2e4eVMaD5d4) · [Company Zoom Backgrounds](https://drive.google.com/drive/folders/1ucXHzCUjvMaj23wXxUlOVAk6nY86IWRP)\nSet up a quiet, well-lit environment.' },
        { name: '📅 Book Your CFT Sign-Off', value: '[Schedule with Vick](https://calendly.com/vickminhas/cft_signoff)' },
        { name: '✅ When Complete', value: 'Check off your APT and connect with your trainer to move into **Phase 2**.' },
      )
      .setFooter({ text: 'Your goal is not to be perfect — it\'s to practice, stay coachable, and trust the process.' }),
  ],

  // ── PHASE 2 ──────────────────────────────────────────────────────────────────
  '1295044213930459187': [
    new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle('Phase 2 — Field Training & First Promotion')
      .setDescription('Great job completing Phase 1! Your focus now shifts to real experience, income, and your first promotion.')
      .addFields(
        { name: '🎬 Phase 2 Training Video', value: '[Watch Phase 2](https://drive.google.com/file/d/1GwKHOZuOcRmYx7DpggraxNmriiGOmD7R/view?usp=drive_link) · [Open Folder](https://drive.google.com/drive/folders/14AV6R4mZb5ZqK4G8TUmal9Gl-j5OCiyc?usp=drive_link)' },
        { name: '🎯 Your Main Focus', value: 'Schedule and attend **Field Training Appointments (FTAs)** alongside a Certified Field Trainer. Observe, take notes, and build confidence.' },
        { name: '🎬 Before Your First FTA', value: '[Watch: Setting the Tone](https://drive.google.com/file/d/1Ei3Ux2to-NCnXJLeuJ9D-52L3-oDV9jn/view?usp=drive_link)' },
        { name: '🛠️ Tools for Success', value: '[2-Minute Story Guide](https://docs.google.com/document/d/1iazeEb1X06y9WSKbQ8w4gFKsVc0Fgj-u/edit) · [Reference Script](https://docs.google.com/document/d/1n6LsUrJpEVxGXLtiUds-V1aSkwgFy_a-/edit)' },
        { name: '📋 How to Show Up', value: 'Camera on. Follow [Zoom etiquette](https://www.youtube.com/watch?v=2e4eVMaD5d4). Take notes. Ask questions before/after calls — never during.' },
        { name: '🏆 Phase 2 Goals', value: '✓ Become Net Licensed (earn your first $1,000)\n✓ Hit Senior Associate within 30 days (+25% earnings)\n✓ Begin your path to Certified Field Trainer' },
        { name: '⏱️ Timeline', value: '**14 days** full-time · **30 days** part-time' },
        { name: '✅ When Complete', value: 'Move into **Phase 3 — Becoming a Certified Field Trainer**.' },
      )
      .setFooter({ text: 'Always focused on trust, never pressure. · All Financial Freedom' }),
  ],

  // ── PHASE 3 ──────────────────────────────────────────────────────────────────
  '1295044213930459188': [
    new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle('Phase 3 — Becoming a Certified Field Trainer')
      .setDescription('**Phase 3 = CFT**\n\nCFTs run all appointments independently and can take an agent from Day 1 to CFT on their own. You know how to get yourself paid *and* your agents paid.')
      .addFields(
        { name: '📋 Requirements', value: '✓ At least one active cold market system (Career Builder, LinkedIn, Instagram, Google Ads, or alternative)\n✓ Strong understanding of all flagship products\n✓ Knowledge of competing products (Mutual Funds, 401ks, Whole Life, etc.)' },
        { name: '🎯 Presentations to Complete', value: '[Discovery Call / Hiring Interview](https://www.canva.com/design/DAHBuELp_Q8/DVZETLC9PK9976CF-_7dXg/edit)\n[FTA #1 — Rebranding / Field Training](https://docs.google.com/presentation/d/1O8xPhCM9kJ9mjUZOjmgWEsG4_GF7b2qO/edit)\n[FTA #2 — Annuity Presentation](https://www.canva.com/design/DAGMVSV1Lbk/jbTvYtM2ugBmiVV-61OLdw/edit)\n[FTA #2 — IUL Presentation](https://www.canva.com/design/DAGMVVe8QnQ/HsqsisU7jtM17hD2UoXuZA/edit)' },
        { name: '📖 Onboarding Decks (CFT Only)', value: '[Onboarding 1](https://www.canva.com/design/DAHBs1bvFlY/rkmCnggXCSkMJm5R4uaAXA/edit) · [Onboarding 2](https://www.canva.com/design/DAHBtbkxu5Y/1JS_VCJqSei87LETffiMHw/edit) · [Onboarding 3](https://www.canva.com/design/DAHBtQyzSMw/5LDtmD7HXPTv0wIGJWYDnw/edit)' },
        { name: '📜 Reference Script', value: '[Open Script](https://docs.google.com/document/d/1rUXqG_zp6ZWPj-a_dPZUX4IwRCUrJzzo75YKc3iWSC4/edit?tab=t.0)' },
        { name: '✅ When Complete', value: 'Move into **Phase 4 — Marketing Director**.' },
      )
      .setFooter({ text: 'The more you put in, the more you get out. · All Financial Freedom' }),
  ],

  // ── PHASE 4 ──────────────────────────────────────────────────────────────────
  '1295044213930459189': [
    new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle('Phase 4 — Marketing Director & Elite Field Trainer')
      .setDescription('**Phase 4 = Marketing Director**\n\nCongratulations on reaching the final phase before becoming an Executive Marketing Director. This phase is about cultivating your business and developing your leadership IQ.')
      .addFields(
        { name: '🎯 What MDs Can Do', value: 'Run your own agency **fully independently**. Do and teach:\nFTA 1, FTA 2, PFR, Hiring Interview, Follow-Up Hiring Interview, Onboarding 1–4' },
        { name: '📋 MD Must Master', value: '✓ **Taprooting** — Creating 4 deep legs\n✓ **Extracting a List** from any room\n✓ Run a tight, independent system\n✓ Develop others into CFTs\n✓ Strong personal recruiting AND production\n✓ Leadership development\n✓ Business metrics and ratios\n✓ Hiring support staff' },
        { name: '💡 The Core Truth', value: 'It\'s not only about making money — it\'s about **consistently getting paid** and **helping others get paid**.' },
        { name: '🏆 You Have Agents Who Can Develop Agents', value: 'This is the level where your business becomes truly scalable and generational.' },
      )
      .setFooter({ text: 'Wealth · Protection · Legacy · All Financial Freedom' }),
  ],

  // ── BIZTOOLS 101 ─────────────────────────────────────────────────────────────
  '1295044213590982726': [
    new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle('Business Tools & Setup')
      .setDescription('Everything you need to run your backend efficiently. Follow all SOPs here to get set up correctly — this will save you significant time and streamline your business.\n\nIf you have questions, ask your trainer.')
      .addFields(
        { name: '📅 Google Calendar SOPs', value: '[How to Use Google Calendar](https://docs.google.com/document/d/1-MaGqdCHN09J2I7-PEkKQmk5Y44UHIPp_k2nUGlAjwQ/edit)\n[Create a Zoom Hiring Event](https://docs.google.com/document/d/1MFNFEDxIraRK_-1hdJve9lBJ5c_YGEZPC5hkMfnMyfE/edit)\n[Share Your Calendar](https://docs.google.com/document/d/1MfQMTpJ_63NTr4MzekyyApWJtbDlUPTphw8puRJXaKk/edit)' },
        { name: '🗓️ Calendly SOPs', value: '[Set Up Your Calendly](https://drive.google.com/file/d/1S_UKdbXyfv-PhMt468hDaTP4xXag_G5f/view?usp=sharing)\n[Calendly Extension](https://calendly.com/resources/webinars/get-more-done-with-calendly-extension/thank-you)\n[Client Referral Form](https://docs.google.com/spreadsheets/d/1wXGIzkfoR90uje8ezZY5WC7x3Hg4eb9DOw6T9j9BPVg/edit?usp=sharing)' },
        { name: '🎥 Zoom SOPs', value: '[Add Zoom to Google Calendar Event](https://docs.google.com/document/d/1064Okql6QMFgbgUQ2qdTAQBuatLiBK1_uEXumuY1IoA/edit)\n[Share Your Screen in Zoom](https://docs.google.com/document/d/1OVHCf9RR0l6tjJ_E_fieYtYefdchtN9IgoM3mAzEPmQ/edit)' },
        { name: '🔧 Licensing & Compliance', value: '[Get Registered with GFI](https://www.canva.com/design/DAF9bQdipEs/4ZpK2Ei5BV7mPpztS3IYKg/edit)\n[SureLC & Ethos Setup](https://docs.google.com/document/d/1HjsG6uniNSdnlm1cfHYPb6jNKIr9_YrrHeGluM1y3aA/edit)\n[Non-Resident Licenses](https://drive.google.com/file/d/1DOLQWxynrVkoHq34QMcfrqkyr8F10JGJ/view)' },
        { name: '📊 Interactive Resources', value: '[4 Buckets Spreadsheet](https://docs.google.com/spreadsheets/d/1kL7lAknJuQLL-RzcIk5vFIxSAa7ENg_AT2st6H52hsw/edit?usp=sharing) *(make a copy before editing)*\n[Premium Calculator](https://docs.google.com/spreadsheets/d/1z3Gvhi8lGk_OjhbZOtrOSiLwIbLLIM0HIQj6-X8tNsM/edit?gid=1446326801#gid=1446326801)' },
      )
      .setFooter({ text: 'All Financial Freedom · Wealth · Protection · Legacy' }),
  ],

  // ── TRAINER CALENDLYS ────────────────────────────────────────────────────────
  '1295044213590982727': [
    new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle('Team Calendly Links')
      .setDescription('Book time with your trainers and leadership team using the links below.')
      .addFields(
        { name: '👤 Leadership', value: '[Vick Minhas](https://calendly.com/vickminhas)\n[Melinee Minhas — Meet & Greet](https://calendly.com/melineeminhas/meetandgreet)\n[Jeremy Davis](https://calendly.com/davisfamilyfinancial)' },
        { name: '👤 Trainers', value: '[Ivan Castellanos](https://calendly.com/ivan_castellanos)\n[Larissa Zoratti](https://calendly.com/zoratti-larissa)\n[Alexa Tena (Spanish Clients)](https://calendly.com/a_tena/training)' },
        { name: '📋 Licensing & New Business', value: '[Book Licensing Orientation](https://calendly.com/empower-licensing-gfi/licensing-orientation-empower-team)\nFor licensing course help, license applications, CEs, carrier appointments, pending business, and commissions:\n📧 **Licensing:** empower.licensing.gfi@gmail.com\n📧 **Pending Business:** empower.underwriting.gfi@gmail.com\n📞 Natalia Marie: 626-219-0066' },
      )
      .setFooter({ text: 'All Financial Freedom · Wealth · Protection · Legacy' }),
  ],

  // ── PRESENTATIONS ────────────────────────────────────────────────────────────
  '1295044213590982728': [
    new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle('Scripts & Presentations')
      .setDescription('Quick access to all scripts and presentation decks. Always focused on trust — never pressure.')
      .addFields(
        { name: '📞 Prospecting', value: '[Reference Script](https://docs.google.com/document/d/1n6LsUrJpEVxGXLtiUds-V1aSkwgFy_a-/edit)\n[ETHOR Script — How to Set Up FTA 1](https://docs.google.com/document/d/1hlJzFNaGm-B-xbeTI3IOnPEyw66nTVZA/edit)\n[General Edification Script](https://docs.google.com/document/d/1g4-0XRZjToyL_5DKenWvnN-E6JC1Kqu8/edit)\n[Closing Questions](https://docs.google.com/document/d/1YDkRm4RWDwwlocGGy2QKOLiO4NQRuBOe/edit)' },
        { name: '🤝 Hiring', value: '[Discovery Call / Hiring Interview](https://www.canva.com/design/DAHBuELp_Q8/DVZETLC9PK9976CF-_7dXg/edit)\n[Discovery Call Example](https://us02web.zoom.us/clips/share/nhD7pOORK7kaODeE2KQW59zC7JEuOpp7K7AHWmHrkcXo8ABLx4fieZQLvbF7qWO_mHWlCw.nMSiNEW9ipr747uY) · [Transcript](https://docs.google.com/document/d/146rsR_XlNgUANj6saYjl_P3VxnrDagR2/edit)\n[Hiring Interview Example](https://us02web.zoom.us/clips/share/ALaNJV2OB2V3aZV1Tm5PePMhy86W_ZBRlXZJXYUhugb7Gor1AIR9idcxaWUMy-XABOUoFw.SJ8Og25tyDBR2eE-)' },
        { name: '📊 Career Overview', value: '[Matthew Welsh](https://www.youtube.com/watch?v=1sM7zuSmI2E&t=4s) · [Adam Ciesielski](https://www.youtube.com/watch?v=xJjqEOY2ehA)' },
        { name: '📋 Field Training (FTA)', value: '[Client Profile Template](https://docs.google.com/document/d/1vUK_XADn8-Bu9Q4kj6Il0M_MBtEO9TXw/edit)\n[FTA #1 — Rebranding / Field Training](https://docs.google.com/presentation/d/1O8xPhCM9kJ9mjUZOjmgWEsG4_GF7b2qO/edit)\n[FTA #1 Example Option 1](https://us02web.zoom.us/clips/share/f4KL779zSXaGiTo81yJbcw)\n[FTA #1 Example Option 2](https://us06web.zoom.us/rec/share/ztJ0fxriZqhJzc5SH4FZbLgVSrtpXAy9mL8YHKdE8XMqgUzYv3y5EZH-XNiUhznV.038NGwDABv7nlqaL) PW: sUz$XAY9\n[FTA #2 — Annuity Presentation](https://www.canva.com/design/DAGMVSV1Lbk/jbTvYtM2ugBmiVV-61OLdw/edit)\n[FTA #2 — IUL Presentation](https://www.canva.com/design/DAGMVVe8QnQ/HsqsisU7jtM17hD2UoXuZA/edit)' },
        { name: '🎓 Onboarding Decks (CFT & Above Only)', value: '[Onboarding 1 with GFI Rocket](https://www.canva.com/design/DAHBs1bvFlY/rkmCnggXCSkMJm5R4uaAXA/edit) · [Recording](https://us02web.zoom.us/rec/share/d1AD3Ba8H1KRl0OwZdvWA2HtV_MfZq2JBPBdjgf0-vWbuUyp3mYvr3OT7GmRZn4j.hATDeSx8hDTNLuph)\n[Onboarding 2](https://www.canva.com/design/DAHBtbkxu5Y/1JS_VCJqSei87LETffiMHw/edit) *(EMD, MD, Elite CFT only)*\n[Onboarding 3](https://www.canva.com/design/DAHBtQyzSMw/5LDtmD7HXPTv0wIGJWYDnw/edit)' },
        { name: '💡 Objection Handling', value: '[Prospecting Deck](https://www.canva.com/design/DAGQj7Yf8hU/S6E9S5rrxakAJX7WObXZPA/edit) · [IUL Deck](https://www.canva.com/design/DAGQj_z9qHg/pWygd0psrbUNjx_Poa5LEA/edit) · [Annuities Deck](https://www.canva.com/design/DAGQjt0HuF0/EpiS1azfP-Cvt-XRev4_pw/edit)\n[IUL & FIA Napkin Presentation](https://us02web.zoom.us/clips/share/4Tlcu1WQM8OSVsfRJFjRSe9Lxx4UaWbiROodeByYXnvj3avRTVcyyD-9gpCF2Er_TzMP1A.CHN3_SdoLNKNzwVo)' },
        { name: '🔗 Digital PFR', value: '[Digital PFR with Matt Welsh](https://us02web.zoom.us/rec/share/vbAb8B7ZTfGT-p7kWfECC6FCwrMAu7TEHJiPUCC8_tkfc6OsHTjEHbFAIAyk5ggE.Ah8HliTnB-tp1-LT) PW: 9JR=?%' },
      )
      .setFooter({ text: 'All Financial Freedom · Wealth · Protection · Legacy' }),
  ],
};

async function run() {
  const guild = await client.guilds.fetch(GUILD_ID);
  console.log(`\nConnected to: ${guild.name}\n`);

  for (const [channelId, messageIds] of Object.entries(DELETE_MESSAGES)) {
    const channel = await client.channels.fetch(channelId);
    console.log(`\n📌 #${channel.name}`);

    // Delete old messages
    for (const msgId of messageIds) {
      try {
        const msg = await channel.messages.fetch(msgId);
        await msg.delete();
        console.log(`  🗑️  Deleted message ${msgId}`);
      } catch (e) {
        console.log(`  ⚠️  Could not delete ${msgId}: ${e.message}`);
      }
    }

    // Post new embeds
    const embeds = CHANNEL_POSTS[channelId];
    if (embeds) {
      for (const embed of embeds) {
        await channel.send({ embeds: [embed] });
      }
      console.log(`  ✅ Posted ${embeds.length} embed(s)`);
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n🎉 All channels updated!');
  client.destroy();
  process.exit(0);
}

client.once('ready', run);
client.on('error', (e) => { console.error(e); process.exit(1); });
client.login(process.env.DISCORD_BOT_TOKEN);

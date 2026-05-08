// AFF Concierge - Post polished branded content to active channels
// Run with: node discord-bot/post-content.js
// Only posts to channels that currently exist in the server.

require('./load-env');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { GUILD_ID, CHANNELS, COLORS } = require('./config');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const CHANNEL_POSTS = {

  // ── RULES ────────────────────────────────────────────────────────────────────
  [CHANNELS.RULES]: [
    new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle('All Financial Freedom · Community Standards')
      .setDescription('We\'re building something real here. This server is your home base for training, resources, and team culture. Show up like it.')
      .addFields(
        { name: '🤝 Respect Everyone', value: 'Lift each other up. We are a team of professionals serving families — lead with that energy in every conversation.' },
        { name: '💪 Look Out for Each Other', value: 'If someone\'s stuck, help them. If someone wins, celebrate them. The fastest way to grow your business is to grow the people around you.' },
        { name: '🪪 Display Name Format', value: '`First Name Last Name - AgentID`\nKeep your nickname updated so teammates know who they\'re talking to.' },
        { name: '🚀 Get Started', value: 'Everything you need is in your [Agent Portal](https://allfinancialfreedom.com/agents) — checklists, training materials, and orientation calls.' },
        { name: '📌 Stay on Topic', value: 'Keep posts relevant to the channel. No spam, no self-promotion of outside businesses or services.' },
        { name: '⚠️ Violations', value: '3 warnings before removal. Disrespect or repeated rule-breaking results in a kick or ban.' },
      )
      .setFooter({ text: 'All Financial Freedom · No Family Left Behind.' }),
  ],

  // ── BUSINESS TOOLS ───────────────────────────────────────────────────────────
  [CHANNELS.BUSINESS_TOOLS]: [
    new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle('Business Tools & Setup')
      .setDescription('Everything you need to run your backend efficiently. Your Agent Portal has your full checklist with setup steps built in.')
      .addFields(
        { name: '🚀 Agent Portal', value: '[allfinancialfreedom.com/agents](https://allfinancialfreedom.com/agents)\nYour go-to for checklists, resources, and business tools.' },
        { name: '📅 Google Calendar SOPs', value: '[How to Use Google Calendar](https://docs.google.com/document/d/1-MaGqdCHN09J2I7-PEkKQmk5Y44UHIPp_k2nUGlAjwQ/edit)\n[Create a Zoom Hiring Event](https://docs.google.com/document/d/1MFNFEDxIraRK_-1hdJve9lBJ5c_YGEZPC5hkMfnMyfE/edit)\n[Share Your Calendar](https://docs.google.com/document/d/1MfQMTpJ_63NTr4MzekyyApWJtbDlUPTphw8puRJXaKk/edit)' },
        { name: '🗓️ Calendly SOPs', value: '[Set Up Your Calendly](https://drive.google.com/file/d/1S_UKdbXyfv-PhMt468hDaTP4xXag_G5f/view?usp=sharing)\n[Client Referral Form](https://docs.google.com/spreadsheets/d/1wXGIzkfoR90uje8ezZY5WC7x3Hg4eb9DOw6T9j9BPVg/edit?usp=sharing)' },
        { name: '🎥 Zoom SOPs', value: '[Add Zoom to Calendar Event](https://docs.google.com/document/d/1064Okql6QMFgbgUQ2qdTAQBuatLiBK1_uEXumuY1IoA/edit)\n[Share Your Screen in Zoom](https://docs.google.com/document/d/1OVHCf9RR0l6tjJ_E_fieYtYefdchtN9IgoM3mAzEPmQ/edit)' },
        { name: '🔧 Licensing & Compliance', value: '[Get Registered with GFI](https://www.canva.com/design/DAF9bQdipEs/4ZpK2Ei5BV7mPpztS3IYKg/edit)\n[SureLC & Ethos Setup](https://docs.google.com/document/d/1HjsG6uniNSdnlm1cfHYPb6jNKIr9_YrrHeGluM1y3aA/edit)\n[Non-Resident Licenses](https://drive.google.com/file/d/1DOLQWxynrVkoHq34QMcfrqkyr8F10JGJ/view)' },
        { name: '📊 Interactive Resources', value: '[4 Buckets Spreadsheet](https://docs.google.com/spreadsheets/d/1kL7lAknJuQLL-RzcIk5vFIxSAa7ENg_AT2st6H52hsw/edit?usp=sharing) *(make a copy before editing)*\n[Premium Calculator](https://docs.google.com/spreadsheets/d/1z3Gvhi8lGk_OjhbZOtrOSiLwIbLLIM0HIQj6-X8tNsM/edit?gid=1446326801#gid=1446326801)' },
      )
      .setFooter({ text: 'All Financial Freedom · Wealth · Protection · Legacy' }),
  ],

  // ── TRAINER BOOKING ──────────────────────────────────────────────────────────
  [CHANNELS.TRAINER_BOOKING]: [
    new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle('Team Calendly Links')
      .setDescription('Book time with your trainers and leadership team using the links below.')
      .addFields(
        { name: '📅 Book Time with the Team', value: '[allfinancialfreedom.com/agents](https://allfinancialfreedom.com/agents)\nLog in to your Agent Portal to book orientation calls, meet-and-greets, and trainer sessions.' },
        { name: '📋 Licensing & New Business', value: 'For licensing help, carrier appointments, pending business, and commissions, reach out through your [Agent Portal](https://allfinancialfreedom.com/agents).' },
      )
      .setFooter({ text: 'All Financial Freedom · Wealth · Protection · Legacy' }),
  ],

  // ── PRESENTATIONS ────────────────────────────────────────────────────────────
  [CHANNELS.PRESENTATIONS]: [
    new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle('Scripts & Presentations')
      .setDescription('Quick access to all scripts and presentation decks. Always focused on trust, never pressure.')
      .addFields(
        { name: '🚀 Agent Portal', value: '[allfinancialfreedom.com/agents](https://allfinancialfreedom.com/agents)\nAll resources are organized in your portal. Log in to access your phase materials.' },
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
  await client.guilds.fetch(GUILD_ID);
  console.log('\nPosting to active channels...\n');

  for (const [channelId, embeds] of Object.entries(CHANNEL_POSTS)) {
    try {
      const channel = await client.channels.fetch(channelId);
      console.log(`\n📌 #${channel.name}`);

      // Delete existing bot embed messages so we don't pile up duplicates
      const recent = await channel.messages.fetch({ limit: 20 });
      const botMsgs = recent.filter(m => m.author.id === client.user.id && m.embeds.length > 0);
      for (const msg of botMsgs.values()) {
        await msg.delete();
        console.log(`  🗑️  Deleted old bot message`);
      }

      for (const embed of embeds) {
        await channel.send({ embeds: [embed] });
      }
      console.log(`  ✅ Posted ${embeds.length} embed(s)`);
    } catch (e) {
      console.log(`  ⚠️  Skipped channel ${channelId}: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\nAll channels updated!');
  client.destroy();
  process.exit(0);
}

client.once('ready', run);
client.on('error', (e) => { console.error(e); process.exit(1); });
client.login(process.env.DISCORD_BOT_TOKEN);

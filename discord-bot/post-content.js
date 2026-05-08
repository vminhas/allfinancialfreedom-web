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

  // ── RESOURCES ────────────────────────────────────────────────────────────────
  [CHANNELS.RESOURCES]: [
    new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle('Team Resources')
      .setDescription('Everything you need to build your business. Start with your Agent Portal — it has your checklist, booking links, and curated training materials all in one place.')
      .addFields(
        { name: '🚀 Agent Portal', value: '[Portal Home](https://allfinancialfreedom.com/agents)  ·  [Book Time with the Team](https://allfinancialfreedom.com/agents/book)  ·  [Training Videos & Tools](https://allfinancialfreedom.com/agents/resources)  ·  [Leaderboard](https://allfinancialfreedom.com/agents/leaderboard)' },
        { name: '📞 Scripts', value: '[Reference Script](https://docs.google.com/document/d/1n6LsUrJpEVxGXLtiUds-V1aSkwgFy_a-/edit)  ·  [ETHOR Script](https://docs.google.com/document/d/1hlJzFNaGm-B-xbeTI3IOnPEyw66nTVZA/edit)  ·  [Edification Script](https://docs.google.com/document/d/1g4-0XRZjToyL_5DKenWvnN-E6JC1Kqu8/edit)  ·  [Closing Questions](https://docs.google.com/document/d/1YDkRm4RWDwwlocGGy2QKOLiO4NQRuBOe/edit)' },
        { name: '🤝 Hiring & Field Training', value: '[Hiring Interview](https://www.canva.com/design/DAHBuELp_Q8/DVZETLC9PK9976CF-_7dXg/edit)  ·  [FTA 1](https://docs.google.com/presentation/d/1O8xPhCM9kJ9mjUZOjmgWEsG4_GF7b2qO/edit)  ·  [FTA 2 Annuity](https://www.canva.com/design/DAGMVSV1Lbk/jbTvYtM2ugBmiVV-61OLdw/edit)  ·  [FTA 2 IUL](https://www.canva.com/design/DAGMVVe8QnQ/HsqsisU7jtM17hD2UoXuZA/edit)' },
        { name: '🎓 Onboarding Decks (CFT & Above)', value: '[Onboarding 1](https://www.canva.com/design/DAHBs1bvFlY/rkmCnggXCSkMJm5R4uaAXA/edit)  ·  [Onboarding 2](https://www.canva.com/design/DAHBtbkxu5Y/1JS_VCJqSei87LETffiMHw/edit)  ·  [Onboarding 3](https://www.canva.com/design/DAHBtQyzSMw/5LDtmD7HXPTv0wIGJWYDnw/edit)' },
        { name: '💡 Objection Handling', value: '[Prospecting Deck](https://www.canva.com/design/DAGQj7Yf8hU/S6E9S5rrxakAJX7WObXZPA/edit)  ·  [IUL Deck](https://www.canva.com/design/DAGQj_z9qHg/pWygd0psrbUNjx_Poa5LEA/edit)  ·  [Annuities Deck](https://www.canva.com/design/DAGQjt0HuF0/EpiS1azfP-Cvt-XRev4_pw/edit)' },
        { name: '📊 Career Overview', value: '[Matthew Welsh](https://www.youtube.com/watch?v=1sM7zuSmI2E&t=4s)  ·  [Adam Ciesielski](https://www.youtube.com/watch?v=xJjqEOY2ehA)' },
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

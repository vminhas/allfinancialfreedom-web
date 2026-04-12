require('./load-env');
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
  console.log(`\n✅ Connected as: ${client.user.tag}\n`);

  for (const guild of client.guilds.cache.values()) {
    console.log(`\n═══════════════════════════════════════`);
    console.log(`SERVER: ${guild.name} (${guild.id})`);
    console.log(`Members: ${guild.memberCount}`);
    console.log(`═══════════════════════════════════════\n`);

    // Fetch all channels
    const channels = await guild.channels.fetch();

    // Group by category
    const categories = channels.filter(c => c.type === 4).sort((a, b) => a.position - b.position);
    const uncategorized = channels.filter(c => c.type !== 4 && !c.parentId);

    console.log('📁 CATEGORIES & CHANNELS:');
    for (const category of categories.values()) {
      console.log(`\n  📂 [${category.position}] ${category.name.toUpperCase()} (id: ${category.id})`);
      const children = channels
        .filter(c => c.parentId === category.id)
        .sort((a, b) => a.position - b.position);
      for (const ch of children.values()) {
        const icon = ch.type === 2 ? '🔊' : ch.type === 15 ? '📋' : '#';
        console.log(`       ${icon} ${ch.name} (id: ${ch.id})`);
      }
    }

    if (uncategorized.size > 0) {
      console.log(`\n  📂 [UNCATEGORIZED]`);
      for (const ch of uncategorized.values()) {
        const icon = ch.type === 2 ? '🔊' : '#';
        console.log(`       ${icon} ${ch.name} (id: ${ch.id})`);
      }
    }

    // Roles
    const roles = await guild.roles.fetch();
    console.log('\n\n🎭 ROLES:');
    for (const role of roles.sort((a, b) => b.position - a.position).values()) {
      if (role.name === '@everyone') continue;
      const hex = role.hexColor !== '#000000' ? ` [${role.hexColor}]` : '';
      console.log(`  • ${role.name}${hex} (id: ${role.id})`);
    }

    console.log('\n');

    // Deep scan - read recent messages in each channel
    console.log('\n\n📨 CHANNEL MESSAGE PREVIEWS:\n');
    const textChannels = channels.filter(c => c.type === 0); // text channels only
  for (const channel of textChannels.values()) {
    try {
      const messages = await channel.messages.fetch({ limit: 5 });
      if (messages.size === 0) {
        console.log(`\n  #${channel.name} — (empty)`);
        continue;
      }
      console.log(`\n  #${channel.name} [${messages.size} recent msgs]`);
      for (const msg of messages.values()) {
        const author = msg.author.bot ? `[BOT: ${msg.author.username}]` : `[${msg.author.username}]`;
        const content = msg.content ? msg.content.slice(0, 200) : '';
        const embeds = msg.embeds.length > 0 ? ` [EMBED: ${msg.embeds[0]?.title || msg.embeds[0]?.description?.slice(0,80) || 'embed'}]` : '';
        const attachments = msg.attachments.size > 0 ? ` [ATTACHMENT]` : '';
        console.log(`    ${author}: ${content}${embeds}${attachments}`);
      }
    } catch (e) {
      console.log(`\n  #${channel.name} — (no access: ${e.message})`);
    }
  }

  }

  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);

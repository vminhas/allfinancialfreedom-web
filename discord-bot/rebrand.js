require('./load-env');
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const GUILD_ID = '1295044213360296048';

// What to rename
const CATEGORY_RENAMES = {
  '1295044213590982723': 'ALL FINANCIAL FREEDOM', // EMPOWER → ALL FINANCIAL FREEDOM
};

const ROLE_RENAMES = {
  '1295044213389393953': { name: 'AFF Team Leader', color: 0xC9A84C },  // Empower Team Leader
  '1295044213360296057': { name: 'AFF Member', color: 0x1a3a5c },        // Team Empower
};

// AFF brand colors for key roles
const ROLE_COLOR_UPDATES = {
  '1295044213389393958': 0x1a2744,  // Admin → navy
  '1295044213389393951': 0xC9A84C,  // Elite CFT → gold
  '1295044213389393950': 0xC9A84C,  // MD → gold
};

async function rebrand() {
  const guild = await client.guilds.fetch(GUILD_ID);
  console.log(`\nConnected to: ${guild.name}`);
  console.log('Starting rebrand...\n');

  // 1. Rename server
  await guild.setName('All Financial Freedom');
  console.log('✅ Server renamed → All Financial Freedom');

  // 2. Rename categories
  for (const [id, newName] of Object.entries(CATEGORY_RENAMES)) {
    const channel = await guild.channels.fetch(id);
    await channel.setName(newName);
    console.log(`✅ Category renamed → ${newName}`);
  }

  // 3. Rename + recolor roles
  for (const [id, updates] of Object.entries(ROLE_RENAMES)) {
    const role = await guild.roles.fetch(id);
    await role.edit({ name: updates.name, color: updates.color });
    console.log(`✅ Role renamed → ${updates.name}`);
  }

  // 4. Recolor roles to match AFF palette
  for (const [id, color] of Object.entries(ROLE_COLOR_UPDATES)) {
    const role = await guild.roles.fetch(id);
    await role.edit({ color });
    console.log(`✅ Role color updated → ${role.name}`);
  }

  console.log('\n🎉 Rebrand complete!');
  client.destroy();
  process.exit(0);
}

client.once('clientReady', rebrand);
client.login(process.env.DISCORD_BOT_TOKEN);

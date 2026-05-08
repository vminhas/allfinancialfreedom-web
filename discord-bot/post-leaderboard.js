// Run once: node discord-bot/post-leaderboard.js
require('./load-env');
const { Client, GatewayIntentBits } = require('discord.js');
const { postLeaderboard } = require('./leaderboard');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    await postLeaderboard(client);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.on('error', (e) => { console.error(e); process.exit(1); });
client.login(process.env.DISCORD_BOT_TOKEN);

// Manual one-off registration of slash commands with Discord.
//   node discord-bot/deploy-commands.js
//
// Normally you do NOT need this: bot.js auto-registers the same
// commands (from ./commands) on every startup, so a Railway redeploy
// is enough. This script stays as an out-of-band escape hatch.

require('./load-env');
const { REST, Routes } = require('discord.js');
const { GUILD_ID } = require('./config');
const { commands } = require('./commands');

const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  console.log('Registering slash commands...');
  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, GUILD_ID),
    { body: commands },
  );
  console.log('✅ Slash commands registered.');
})();

// Run this once to register slash commands with Discord
// node discord-bot/deploy-commands.js

const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { GUILD_ID } = require('./config');

const commands = [
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post a branded announcement to #announcements')
    .addStringOption(opt =>
      opt.setName('message').setDescription('The announcement text').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('phase')
    .setDescription('Assign a phase role to a team member')
    .addUserOption(opt =>
      opt.setName('user').setDescription('The team member').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('phase')
        .setDescription('Which phase to assign')
        .setRequired(true)
        .addChoices(
          { name: 'Phase 1 - Step 1', value: '1-1' },
          { name: 'Phase 1 - Step 2', value: '1-2' },
          { name: 'Phase 1 - Step 3', value: '1-3' },
          { name: 'Phase 2', value: '2' },
          { name: 'Phase 3', value: '3' },
          { name: 'Phase 4', value: '4' },
        )
    ),
].map(cmd => cmd.toJSON());

const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  console.log('Registering slash commands...');
  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, GUILD_ID),
    { body: commands },
  );
  console.log('✅ Slash commands registered.');
})();

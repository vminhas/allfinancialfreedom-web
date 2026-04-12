// Run this once to register slash commands with Discord
// node discord-bot/deploy-commands.js

require('./load-env');
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { GUILD_ID } = require('./config');

const commands = [
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post a branded AFF announcement to any channel')
    .addStringOption(opt =>
      opt.setName('message').setDescription('The announcement text').setRequired(true)
    )
    .addChannelOption(opt =>
      opt.setName('channel').setDescription('Channel to post in (defaults to current channel)').setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('ping').setDescription('Ping @everyone? (default: false)').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('edit')
    .setDescription('Edit the description of a bot message')
    .addStringOption(opt =>
      opt.setName('message_id').setDescription('Leave blank to auto-edit the most recent bot message in this channel').setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('content').setDescription('The new text for the message body (leave blank to preview current content)').setRequired(false)
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

// Single source of truth for the bot's slash command definitions.
// Used by bot.js (auto-registers these on every startup) and by
// deploy-commands.js (manual one-off registration). Add a command here
// once and a Railway redeploy is all it takes to register it.

const { SlashCommandBuilder } = require('discord.js');

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

  new SlashCommandBuilder()
    .setName('tevah-sync')
    .setDescription('Sync agents and submissions from Tevah right now (admin only)'),
].map(cmd => cmd.toJSON());

module.exports = { commands };

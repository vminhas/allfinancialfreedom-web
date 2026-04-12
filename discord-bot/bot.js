const { Client, GatewayIntentBits, EmbedBuilder, Events } = require('discord.js');
const { GUILD_ID, CHANNELS, ROLES, COLORS } = require('./config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ─── Phase onboarding content ────────────────────────────────────────────────
const PHASE_CONTENT = {
  [ROLES.PHASE_1_STEP_1]: {
    title: 'Welcome to Phase 1 — Step 1: Setup & Foundation',
    description: 'This is your official starting point. Get set up, plugged in, and ready to build with clarity.',
    fields: [
      { name: '📋 Your First Steps', value: 'Locate your Agent Portal (APT) and get familiar with the platform.' },
      { name: '📚 Product Clarity Videos', value: '[IUL Basics](https://www.youtube.com/watch?v=wX89Rk5pr6A)\n[Million Dollar Baby Policy](https://www.youtube.com/watch?v=gI_QpwKjOyM)' },
      { name: '🗓️ Need Help?', value: '[Book a Licensing Orientation](https://calendly.com/empower-licensing-gfi/licensing-orientation-empower-team)' },
      { name: '📁 Phase 1 Resources Folder', value: 'Check `#phase-1-step-1` in the server for all links and tools.' },
    ],
  },
  [ROLES.PHASE_1_STEP_2]: {
    title: 'Congratulations — Phase 1, Step 2: Execution & Momentum',
    description: 'You\'ve completed your foundation. Now it\'s time to take action and build momentum.',
    fields: [
      { name: '🎯 Your Focus', value: 'Start executing on what you\'ve learned. Your activity drives your results.' },
      { name: '📹 Step 2 Training Video', value: '[Watch Phase 1 Part 2](https://drive.google.com/file/d/1oxyju_RlNVAayEm2UUQqJPV1_lAY8ILB/view?usp=drive_link)' },
      { name: '📁 Resources', value: 'Check `#phase-1-step-2` in the server for all materials.' },
    ],
  },
  [ROLES.PHASE_1_STEP_3]: {
    title: 'Congratulations on Passing Your Exam — Phase 1, Step 3: Preparation & Confidence',
    description: 'Huge milestone — you\'re licensed! Now let\'s get you polished and confident.',
    fields: [
      { name: '📹 Step 3 Training Video', value: '[Watch Phase 1 Part 3](https://drive.google.com/file/d/1YAzXzHwrY9Z7H82NJtYJ4Mi7tBiGTjU8/view?usp=drive_link)' },
      { name: '📅 CFT Sign-Off Calendly', value: '[Book Your CFT Sign-Off](https://calendly.com/vickminhas/cft_signoff)' },
      { name: '📁 Resources', value: 'Check `#phase-1-step-3` in the server for all materials.' },
    ],
  },
  [ROLES.PHASE_2]: {
    title: 'Welcome to Phase 2: Field Training & First Promotion',
    description: 'Great job completing Phase 1! You\'re now moving into field training and working toward your first promotion.',
    fields: [
      { name: '📹 Phase 2 Training Video', value: '[Watch Phase 2](https://drive.google.com/file/d/1GwKHOZuOcRmYx7DpggraxNmriiGOmD7R/view?usp=drive_link)' },
      { name: '📁 Resources', value: 'Check `#phase-2-focus` in the server for all materials.' },
    ],
  },
  [ROLES.PHASE_3]: {
    title: 'Welcome to Phase 3: Becoming a Certified Field Trainer',
    description: 'During Phase 3 you\'ll complete the steps to become a CFT. CFTs can run all appointments independently and take agents from Day 1.',
    fields: [
      { name: '📋 Onboarding Slides', value: '[Onboarding 1](https://www.canva.com/design/DAHBs1bvFlY/rkmCnggXCSkMJm5R4uaAXA/edit)\n[Onboarding 2](https://www.canva.com/design/DAHBtbkxu5Y/1JS_VCJqSei87LETffiMHw/edit)' },
      { name: '📁 Resources', value: 'Check `#phase-3-focus` in the server for all materials.' },
    ],
  },
  [ROLES.PHASE_4]: {
    title: 'Welcome to Phase 4: Final Phase Before EMD',
    description: 'Congratulations on making it to the final phase before becoming an Executive Marketing Director!',
    fields: [
      { name: '🎯 Your Goal', value: 'Complete the steps to become a Marketing Director.' },
      { name: '📁 Resources', value: 'Check `#phase-4-focus` in the server for all materials.' },
    ],
  },
};

// ─── Welcome embed ────────────────────────────────────────────────────────────
function buildWelcomeEmbed(member) {
  return new EmbedBuilder()
    .setColor(COLORS.NAVY)
    .setTitle('Welcome to All Financial Freedom')
    .setDescription(`Hey ${member}, we're thrilled to have you on the team.\n\n*Wealth · Protection · Legacy*`)
    .addFields(
      { name: '📋 Get Started', value: `Read <#${CHANNELS.RULES}> to understand our community standards.`, inline: false },
      { name: '🚀 Your Journey', value: 'Your leader will assign your Phase 1 role to unlock your onboarding materials.', inline: false },
      { name: '🌐 Our Website', value: '[allfinancialfreedom.com](https://allfinancialfreedom.com) — articles, resources, and tools.', inline: false },
    )
    .setFooter({ text: 'All Financial Freedom — Building a future you feel confident in.' })
    .setTimestamp();
}

// ─── Phase DM embed ──────────────────────────────────────────────────────────
function buildPhaseEmbed(phaseData) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(phaseData.title)
    .setDescription(phaseData.description)
    .setFooter({ text: 'All Financial Freedom · Wealth · Protection · Legacy' })
    .setTimestamp();

  for (const field of phaseData.fields) {
    embed.addFields({ name: field.name, value: field.value, inline: false });
  }

  return embed;
}

// ─── Events ──────────────────────────────────────────────────────────────────

// New member joins
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    // DM the new member
    await member.send({ embeds: [buildWelcomeEmbed(member)] });
  } catch {
    // Member may have DMs disabled — that's okay
  }

  // Post welcome in #welcome channel
  const welcomeChannel = member.guild.channels.cache.get(CHANNELS.WELCOME);
  if (welcomeChannel) {
    await welcomeChannel.send({ embeds: [buildWelcomeEmbed(member)] });
  }
});

// Role assigned — send phase onboarding DM
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));

  for (const [roleId] of addedRoles) {
    const phaseContent = PHASE_CONTENT[roleId];
    if (!phaseContent) continue;

    try {
      await newMember.send({
        embeds: [
          buildPhaseEmbed(phaseContent),
        ],
      });
    } catch {
      // DMs disabled — post in the relevant phase channel instead
      const phaseChannelMap = {
        [ROLES.PHASE_1_STEP_1]: CHANNELS.PHASE_1_STEP_1,
        [ROLES.PHASE_1_STEP_2]: CHANNELS.PHASE_1_STEP_2,
        [ROLES.PHASE_1_STEP_3]: CHANNELS.PHASE_1_STEP_3,
        [ROLES.PHASE_2]:        CHANNELS.PHASE_2,
        [ROLES.PHASE_3]:        CHANNELS.PHASE_3,
        [ROLES.PHASE_4]:        CHANNELS.PHASE_4,
      };
      const channelId = phaseChannelMap[roleId];
      if (channelId) {
        const channel = newMember.guild.channels.cache.get(channelId);
        if (channel) await channel.send({ content: `${newMember}`, embeds: [buildPhaseEmbed(phaseContent)] });
      }
    }
  }
});

// Slash commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /announce — admin only
  if (interaction.commandName === 'announce') {
    const adminRole = interaction.member.roles.cache.get(ROLES.ADMIN);
    if (!adminRole) {
      return interaction.reply({ content: 'You need the Admin role to use this command.', ephemeral: true });
    }

    const message = interaction.options.getString('message');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    const pingEveryone = interaction.options.getBoolean('ping') ?? false;

    const embed = new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle('📣 Announcement')
      .setDescription(message)
      .setFooter({ text: `All Financial Freedom · Posted by ${interaction.user.username}` })
      .setTimestamp();

    await targetChannel.send({ content: pingEveryone ? '@everyone' : '', embeds: [embed] });
    await interaction.reply({ content: `Announcement posted in ${targetChannel}!`, ephemeral: true });
  }

  // /edit — admin edits a bot message
  if (interaction.commandName === 'edit') {
    const adminRole = interaction.member.roles.cache.get(ROLES.ADMIN);
    if (!adminRole) {
      return interaction.reply({ content: 'You need the Admin role to use this command.', ephemeral: true });
    }

    const messageId = interaction.options.getString('message_id');
    const newContent = interaction.options.getString('content');

    try {
      const message = await interaction.channel.messages.fetch(messageId);

      if (message.author.id !== client.user.id) {
        return interaction.reply({ content: '❌ I can only edit my own messages.', ephemeral: true });
      }

      // If no content provided, show current content for easy editing
      if (!newContent) {
        const oldEmbed = message.embeds[0];
        const current = [
          `**Title:** ${oldEmbed?.title || '(none)'}`,
          `**Description:** ${oldEmbed?.description || '(none)'}`,
          oldEmbed?.fields?.length ? `**Fields:**\n${oldEmbed.fields.map(f => `• **${f.name}:** ${f.value}`).join('\n')}` : '',
        ].filter(Boolean).join('\n\n');

        return interaction.reply({
          content: `📋 **Current content of message \`${messageId}\`:**\n\n${current}\n\n---\nRun \`/edit message_id:${messageId} content:your new description here\` to update the description.`,
          ephemeral: true,
        });
      }

      // Update description, preserve everything else
      const oldEmbed = message.embeds[0];
      const updatedEmbed = EmbedBuilder.from(oldEmbed).setDescription(newContent);
      await message.edit({ embeds: [updatedEmbed] });
      await interaction.reply({ content: '✅ Message updated.', ephemeral: true });
    } catch (e) {
      await interaction.reply({ content: `❌ Could not find message. Make sure you copied the ID from this channel.\n\`${e.message}\``, ephemeral: true });
    }
  }

  // /phase — admin assigns phase to a member
  if (interaction.commandName === 'phase') {
    const adminRole = interaction.member.roles.cache.get(ROLES.ADMIN);
    if (!adminRole) {
      return interaction.reply({ content: 'You need the Admin role to use this command.', ephemeral: true });
    }

    const target = interaction.options.getMember('user');
    const phaseNumber = interaction.options.getString('phase');

    const phaseRoleMap = {
      '1-1': ROLES.PHASE_1_STEP_1,
      '1-2': ROLES.PHASE_1_STEP_2,
      '1-3': ROLES.PHASE_1_STEP_3,
      '2':   ROLES.PHASE_2,
      '3':   ROLES.PHASE_3,
      '4':   ROLES.PHASE_4,
    };

    const roleId = phaseRoleMap[phaseNumber];
    if (!roleId) return interaction.reply({ content: 'Invalid phase.', ephemeral: true });

    await target.roles.add(roleId);
    await interaction.reply({ content: `✅ Assigned Phase ${phaseNumber} to ${target}.`, ephemeral: true });
    // The GuildMemberUpdate event will fire and send the DM automatically
  }
});

// ─── Ready ───────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, (c) => {
  console.log(`✅ AFF Concierge online as ${c.user.tag}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);

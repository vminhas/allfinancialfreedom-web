const {
  Client, GatewayIntentBits, EmbedBuilder, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { GUILD_ID, CHANNELS, ROLES, COLORS, EDITORS } = require('./config');

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

// Helper: check if user can edit
function canEdit(interaction) {
  const isAdmin = interaction.member?.roles?.cache?.has(ROLES.ADMIN);
  const isEditor = EDITORS.includes(interaction.user.id);
  return isAdmin || isEditor;
}

// Helper: build edit button row
function editButtonRow(messageId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`edit_btn_${messageId}`)
      .setLabel('✏️ Edit')
      .setStyle(ButtonStyle.Secondary)
  );
}

// Slash commands + button/modal interactions
client.on(Events.InteractionCreate, async (interaction) => {

  // ── Button click → open edit modal ─────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith('edit_btn_')) {
    if (!canEdit(interaction)) {
      return interaction.reply({ content: '❌ You don\'t have permission to edit messages.', ephemeral: true });
    }

    const messageId = interaction.customId.replace('edit_btn_', '');
    const message = await interaction.channel.messages.fetch(messageId);
    const oldEmbed = message.embeds[0];

    const modal = new ModalBuilder()
      .setCustomId(`edit_modal_${messageId}`)
      .setTitle('Edit Message');

    const descInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Description')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(oldEmbed?.description || '')
      .setRequired(false);

    modal.addComponents(new ActionRowBuilder().addComponents(descInput));
    return interaction.showModal(modal);
  }

  // ── Modal submit → update message ──────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId.startsWith('edit_modal_')) {
    const messageId = interaction.customId.replace('edit_modal_', '');
    const message = await interaction.channel.messages.fetch(messageId);
    const oldEmbed = message.embeds[0];
    const builder = EmbedBuilder.from(oldEmbed);

    // Update description if it was in the modal
    try {
      const newDesc = interaction.fields.getTextInputValue('description');
      builder.setDescription(newDesc);
    } catch { /* field not in modal */ }

    // Update any field values that were included
    const updatedFields = oldEmbed.fields ? [...oldEmbed.fields] : [];
    for (let i = 0; i < updatedFields.length; i++) {
      try {
        const newValue = interaction.fields.getTextInputValue(`field_${i}`);
        updatedFields[i] = { ...updatedFields[i], value: newValue };
      } catch { /* field not in modal */ }
    }
    if (updatedFields.length) builder.setFields(updatedFields);

    await message.edit({ embeds: [builder] });
    return interaction.reply({ content: '✅ Updated!', ephemeral: true });
  }

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

  // /edit — edit the most recent bot message in this channel (or a specific one)
  if (interaction.commandName === 'edit') {
    if (!canEdit(interaction)) {
      return interaction.reply({ content: '❌ You don\'t have permission to edit messages.', ephemeral: true });
    }

    try {
      let message;
      const messageId = interaction.options.getString('message_id');

      if (messageId) {
        message = await interaction.channel.messages.fetch(messageId);
      } else {
        // Auto-find the most recent bot message in this channel
        const msgs = await interaction.channel.messages.fetch({ limit: 20 });
        message = msgs.find(m => m.author.id === client.user.id && m.embeds.length > 0);
        if (!message) {
          return interaction.reply({ content: '❌ No bot message found in this channel.', ephemeral: true });
        }
      }

      if (message.author.id !== client.user.id) {
        return interaction.reply({ content: '❌ I can only edit my own messages.', ephemeral: true });
      }

      // Open modal pre-filled with current content
      // Discord modals support max 5 inputs — use description + up to 4 fields
      const oldEmbed = message.embeds[0];
      const modal = new ModalBuilder()
        .setCustomId(`edit_modal_${message.id}`)
        .setTitle((oldEmbed?.title || 'Edit Message').slice(0, 45));

      const components = [];

      // Description input (full size)
      if (oldEmbed?.description !== undefined) {
        components.push(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(oldEmbed.description || '')
            .setMinLength(0)
            .setMaxLength(2000)
            .setRequired(false)
        ));
      }

      // Add up to 4 field values (Discord max = 5 total components)
      const maxFields = Math.min(oldEmbed?.fields?.length || 0, 4);
      for (let i = 0; i < maxFields; i++) {
        const field = oldEmbed.fields[i];
        components.push(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(`field_${i}`)
            .setLabel(field.name.slice(0, 45))
            .setStyle(TextInputStyle.Paragraph)
            .setValue(field.value || '')
            .setMinLength(0)
            .setMaxLength(1024)
            .setRequired(false)
        ));
      }

      modal.addComponents(...components);
      return interaction.showModal(modal);

    } catch (e) {
      await interaction.reply({ content: `❌ Error: ${e.message}`, ephemeral: true });
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

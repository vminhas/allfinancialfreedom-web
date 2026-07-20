const {
  Client, GatewayIntentBits, EmbedBuilder, Events,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  REST, Routes,
} = require('discord.js');
const { GUILD_ID, CHANNELS, ROLES, COLORS, EDITORS } = require('./config');
const { commands } = require('./commands');
const { maybeReactToMessage } = require('./reactions');
const { postLeaderboard, handleLeaderboardButton } = require('./leaderboard');

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
    title: 'Welcome to Phase 1, Step 1: Setup & Foundation',
    description: 'This is your official starting point. Your checklist, resources, and next steps are all in your Agent Portal.',
    fields: [
      { name: '🚀 Your Agent Portal', value: '[allfinancialfreedom.com/agents](https://allfinancialfreedom.com/agents)\nLog in to access your Phase 1 checklist, orientation calls, and training materials.' },
      { name: '📋 First Priority', value: 'Check your welcome email for login instructions, then complete your checklist items in order.' },
      { name: '❓ Need Help?', value: 'Reach out to your trainer or post in the server. Your team is here.' },
    ],
  },
  [ROLES.PHASE_1_STEP_2]: {
    title: 'Phase 1, Step 2: Execution & Momentum',
    description: 'You have completed your foundation. Now shift into action and build momentum.',
    fields: [
      { name: '🚀 Your Agent Portal', value: '[allfinancialfreedom.com/agents](https://allfinancialfreedom.com/agents)\nYour Step 2 checklist and training video are waiting for you.' },
      { name: '🎯 Your Focus', value: 'Pass your state exam (if not yet licensed) or complete post-licensing onboarding. Show up to weekly trainings.' },
    ],
  },
  [ROLES.PHASE_1_STEP_3]: {
    title: 'Phase 1, Step 3: Preparation & Confidence',
    description: 'Congratulations on passing your exam! This step gets you polished and ready for live field training.',
    fields: [
      { name: '🚀 Your Agent Portal', value: '[allfinancialfreedom.com/agents](https://allfinancialfreedom.com/agents)\nYour Step 3 checklist, scripts, and CFT sign-off booking are all in the portal.' },
      { name: '📅 Book Your CFT Sign-Off', value: '[Schedule with Vick](https://calendly.com/vickminhas/cft_signoff)' },
    ],
  },
  [ROLES.PHASE_2]: {
    title: 'Welcome to Phase 2: Field Training & First Promotion',
    description: 'Great job completing Phase 1. Your focus now shifts to real experience, income, and your first promotion.',
    fields: [
      { name: '🚀 Your Agent Portal', value: '[allfinancialfreedom.com/agents](https://allfinancialfreedom.com/agents)\nAccess your Phase 2 checklist, FTA resources, and training schedule.' },
      { name: '🏆 Phase 2 Goals', value: 'Become Net Licensed, hit Senior Associate within 30 days, and begin your path to Certified Field Trainer.' },
    ],
  },
  [ROLES.PHASE_3]: {
    title: 'Welcome to Phase 3: Becoming a Certified Field Trainer',
    description: 'CFTs run all appointments independently and can take an agent from Day 1 to CFT on their own.',
    fields: [
      { name: '🚀 Your Agent Portal', value: '[allfinancialfreedom.com/agents](https://allfinancialfreedom.com/agents)\nYour Phase 3 checklist, onboarding decks, and presentation materials are in the portal.' },
    ],
  },
  [ROLES.PHASE_4]: {
    title: 'Welcome to Phase 4: Marketing Director',
    description: 'Congratulations on reaching the final phase before Executive Marketing Director. This phase is about cultivating your business and developing your leadership.',
    fields: [
      { name: '🚀 Your Agent Portal', value: '[allfinancialfreedom.com/agents](https://allfinancialfreedom.com/agents)\nYour Phase 4 checklist and leadership resources are in the portal.' },
    ],
  },
};

// ─── Welcome embed ────────────────────────────────────────────────────────────
// Note: user mentions inside embeds don't render as clickable names — Discord
// treats them as raw <@id> text. So we use the member's displayName inside
// the embed for a clean look, and put the actual @mention in the message
// `content` (outside the embed) so the ping still fires and the name
// renders as a clickable user link.
function buildWelcomeEmbed(member) {
  const name = member.displayName || member.user?.username || 'friend'
  return new EmbedBuilder()
    .setColor(COLORS.NAVY)
    .setTitle('Welcome to All Financial Freedom')
    .setDescription(`Hey **${name}**, we're thrilled to have you on the team.\n\n*Wealth · Protection · Legacy*`)
    .addFields(
      { name: '📋 Get Started', value: `Read <#${CHANNELS.RULES}> to understand our team standards.`, inline: false },
      { name: '🚀 Your Agent Portal', value: '[allfinancialfreedom.com/agents](https://allfinancialfreedom.com/agents) — your checklist, training materials, and resources are all here.', inline: false },
      { name: '🌐 Our Website', value: '[allfinancialfreedom.com](https://allfinancialfreedom.com) — insights, tools, and resources for your clients.', inline: false },
    )
    .setFooter({ text: 'All Financial Freedom — Building a future you feel confident in.' })
    .setTimestamp();
}

// Companion to the DM welcome. Lighter, more celebratory: no
// onboarding links (those clutter the channel and don't apply to
// teammates seeing the post), just a "say hi" prompt and the new
// member's avatar so faces register. Mirrors how Slack / Linear /
// Notion handle public team-join cards.
function buildPublicWelcomeEmbed(member) {
  const name = member.displayName || member.user?.username || 'friend'
  const avatar = member.user?.displayAvatarURL?.({ size: 128, extension: 'png' })
  return new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle('🎉 New teammate just joined')
    .setDescription(`Everyone, please welcome **${name}** to the All Financial Freedom family.\n\nDrop a wave, say hi, share something useful — that's how we roll.`)
    .setThumbnail(avatar ?? null)
    .setFooter({ text: 'All Financial Freedom · Wealth · Protection · Legacy' })
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

// New member joins — sends both a DM (with onboarding links) and a
// public welcome card to #announcements (so the team can say hi and
// the new agent's first impression isn't an empty channel). Skips
// bot accounts so a future integration joining doesn't trigger a
// fake party.
client.on(Events.GuildMemberAdd, async (member) => {
  if (member.user?.bot) return;

  // 0. Grant AFF Member to every joiner so they can see and interact
  //    with all public channels immediately. Best-effort: log and
  //    continue if the bot lacks permissions.
  try {
    await member.roles.add(ROLES.AFF_MEMBER, 'Auto-granted on join');
  } catch (err) {
    console.warn('[GuildMemberAdd] AFF Member role grant failed:', err?.message ?? err);
  }

  // 1. Personal DM with onboarding links. Member may have DMs
  //    disabled; nothing we can do if so, fall through silently.
  try {
    await member.send({ embeds: [buildWelcomeEmbed(member)] });
  } catch {}

  // 2. Public "say hi" card in #announcements — DISABLED per request.
  //    The Concierge no longer auto-posts a welcome when a member joins;
  //    the personal onboarding DM above still goes out. To bring it back,
  //    restore the announcements.send({ ... buildPublicWelcomeEmbed ... })
  //    call here.
});

// Role assigned — send phase onboarding DM
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));

  for (const [roleId] of addedRoles) {
    const phaseContent = PHASE_CONTENT[roleId];
    if (!phaseContent) continue;

    try {
      await newMember.send({ embeds: [buildPhaseEmbed(phaseContent)] });
    } catch {
      // DMs disabled — post in announcements as a fallback mention
      const announcements = newMember.guild.channels.cache.get(CHANNELS.ANNOUNCEMENTS);
      if (announcements) {
        await announcements.send({ content: `${newMember}`, embeds: [buildPhaseEmbed(phaseContent)] });
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

  // ── Leaderboard tab buttons ─────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith('lb_')) {
    await handleLeaderboardButton(interaction).catch(err =>
      console.error('[Leaderboard] Button handler error:', err)
    );
    return;
  }

  // ── Request Access (from #get-started quarantine channel) ──────────────────
  if (interaction.isButton() && interaction.customId === 'request-access') {
    await interaction.reply({
      content: 'Your request has been received. A member of our team will reach out to you shortly.',
      ephemeral: true,
    });
    const adminActivity = interaction.guild?.channels.cache.get(CHANNELS.ADMIN_ACTIVITY);
    if (adminActivity) {
      const name = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
      await adminActivity.send({
        content: `<@&${ROLES.ADMIN}> — **${name}** (<@${interaction.user.id}>) clicked Request Access from <#${interaction.channelId}>. Assign them the appropriate role to grant access.`,
      }).catch(err => console.error('[request-access] admin post failed:', err));
    }
    return;
  }

  // ── Request Reactivation (from #your-access — AFF Observer members) ────────
  if (interaction.isButton() && interaction.customId === 'request-reactivation') {
    await interaction.reply({
      content: 'Your request for full access has been submitted. A member of leadership will review it shortly.',
      ephemeral: true,
    });
    const adminActivity = interaction.guild?.channels.cache.get(CHANNELS.ADMIN_ACTIVITY);
    if (adminActivity) {
      const name = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
      const approveRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_member_${interaction.user.id}`)
          .setLabel('Approve: Grant AFF Member')
          .setStyle(ButtonStyle.Success)
      );
      await adminActivity.send({
        content: `<@&${ROLES.ADMIN}> — **${name}** (<@${interaction.user.id}>) requested reactivation from <#${interaction.channelId}>.`,
        components: [approveRow],
      }).catch(err => console.error('[request-reactivation] admin post failed:', err));
    }
    return;
  }

  // ── Approve member reactivation (admin clicks the button in #admin-activity) ─
  if (interaction.isButton() && interaction.customId.startsWith('approve_member_')) {
    if (!canEdit(interaction)) {
      return interaction.reply({ content: 'You need the Admin role to approve access.', ephemeral: true });
    }
    const targetId = interaction.customId.replace('approve_member_', '');
    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: 'Could not find that member. They may have left the server.', ephemeral: true });
    }
    await targetMember.roles.add(ROLES.AFF_MEMBER, 'Reactivation approved by admin');
    const name = targetMember.displayName || targetMember.user.username;
    await interaction.reply({ content: `Done. **${name}** has been granted AFF Member access.`, ephemeral: true });
    await interaction.message.edit({
      content: interaction.message.content + `\n\nApproved by <@${interaction.user.id}>`,
      components: [],
    }).catch(() => {});
    return;
  }

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

  // /tevah-sync — admin only. Runs the same full Tevah sync as the
  // hourly cron (agents + submissions, then points/recruits in the
  // background). The web route posts its own detailed summary embed to
  // the admin channel; this reply is just a quick confirmation.
  if (interaction.commandName === 'tevah-sync') {
    const adminRole = interaction.member.roles.cache.get(ROLES.ADMIN);
    if (!adminRole) {
      return interaction.reply({ content: 'You need the Admin role to use this command.', ephemeral: true });
    }

    // The sync can take well over Discord's 3s window, so defer first.
    await interaction.deferReply({ ephemeral: true });

    const baseUrl = process.env.NEXTAUTH_URL || 'https://allfinancialfreedom.com';
    try {
      const res = await fetch(`${baseUrl}/api/cron/tevah-sync`, {
        method: 'POST',
        headers: { 'x-cron-secret': process.env.CRON_SECRET || '' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return interaction.editReply(
          `Tevah sync failed${data.error ? `: ${data.error}` : ` (HTTP ${res.status})`}.`
        );
      }
      const a = data.agents || {};
      const s = data.submissions || {};
      const agentLine = a.error
        ? `Agents: failed (${a.error})`
        : `Agents: ${a.created ?? 0} new, ${a.updated ?? 0} updated${a.invited ? `, ${a.invited} invited` : ''}`;
      const subLine = s.error
        ? `Submissions: failed (${s.error})`
        : `Submissions: ${s.created ?? 0} new, ${s.updated ?? 0} updated, ${s.announced ?? 0} announced`;
      await interaction.editReply(`✅ Tevah sync complete.\n${agentLine}\n${subLine}`);
    } catch (err) {
      await interaction.editReply(`Tevah sync error: ${err.message || err}`);
    }
  }
});

// ─── Auto-react to celebration-worthy messages ──────────────────────────────
// Pattern-matches on shoutouts, big wins, morning greetings, action pings,
// and meeting links - reacts with a small emoji set so the team feels
// celebrated even when not everyone is online to react manually.
// Throttled per author + opt-out via DISCORD_REACT_DISABLED env var.
client.on(Events.MessageCreate, (message) => {
  // Fire-and-forget so a slow react doesn't delay the flyer parser.
  maybeReactToMessage(message).catch(() => {});
});

// ─── Training flyer parser — send an image to auto-create events ────────────
client.on(Events.MessageCreate, async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Only process from admins/editors
  const isAdmin = message.member?.roles?.cache?.has(ROLES.ADMIN);
  const isEditor = EDITORS.includes(message.author.id);
  if (!isAdmin && !isEditor) return;

  // Only process messages with image attachments
  const image = message.attachments.find(a => a.contentType?.startsWith('image/'));
  if (!image) return;

  // Only respond if the message is in the admin channel or a DM.
  // Previously we also matched any image whose caption mentioned
  // 'flyer' / 'training' / 'event' anywhere -- that was eating
  // flyers Vick posted in #announcements alongside copy like 'tonight's
  // training flyer is up.' Restricting the trigger to the dedicated
  // admin channel + DMs keeps the parser opt-in: drop a flyer in
  // admin to add it to the system, drop it in announcements to just
  // share it visually.
  const adminChannelId = process.env.DISCORD_ADMIN_CHANNEL_ID;
  const isDM = !message.guild;
  const isAdminChannel = adminChannelId && message.channelId === adminChannelId;
  if (!isDM && !isAdminChannel) return;

  // React to acknowledge
  await message.react('⏳').catch(() => {});

  try {
    // Download the image
    const res = await fetch(image.url);
    if (!res.ok) throw new Error('Failed to download image');
    const buffer = Buffer.from(await res.arrayBuffer());

    // Send to the parse-image API
    const baseUrl = process.env.NEXTAUTH_URL || 'https://allfinancialfreedom.com';
    const form = new FormData();
    form.append('image', new Blob([buffer], { type: image.contentType || 'image/jpeg' }), image.name || 'flyer.jpg');

    const apiRes = await fetch(`${baseUrl}/api/admin/trainings/parse-image`, {
      method: 'POST',
      body: form,
      headers: {
        // Use cron secret as auth since this is server-to-server
        'x-cron-secret': process.env.CRON_SECRET || '',
      },
    });

    const data = await apiRes.json();

    // Remove the hourglass
    await message.reactions.cache.get('⏳')?.remove().catch(() => {});

    if (apiRes.ok && data.parsed > 0) {
      const lines = data.events.map(e => {
        const date = new Date(e.startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
        let status = '';
        if (e.discordEvent === 'created') status = ' ✅ Discord event created';
        else if (e.discordEvent === false) status = ` ⚠️ Discord failed: ${e.discordError || 'unknown'}`;
        else if (e.discordEvent === 'skipped (past date)') status = ' ⏭️ Past date, no Discord event';
        else if (e.discordEvent === 'duplicate') {
          const reason = e.duplicateReason ? ` (${e.duplicateReason})` : '';
          const matchedTitle = e.duplicateTitle && e.duplicateTitle !== e.title ? ` [matched: "${e.duplicateTitle}"]` : '';
          status = ` ♻️ Already exists, skipped${reason}${matchedTitle}`;
        }
        // Recurring series (e.g. a Mon-Fri flyer): show that it repeats and
        // auto-extends, and that the shown date is just the first occurrence.
        const recur = e.recurrenceLabel
          ? ` · 🔁 ${e.recurrenceLabel}${e.occurrences ? ` (${e.occurrences} scheduled now)` : ''}`
          : '';
        const dateLabel = e.recurrenceLabel ? `starts ${date}` : date;
        return `• **${e.title}** — ${dateLabel}${recur}${status}`;
      });
      const recurringCount = data.events.filter(e => e.recurrenceLabel).length;
      // Distinguish "all duplicate" / "some duplicate" / "all new" so Vick
      // gets immediate feedback on whether the second post of a flyer
      // actually did anything.
      const dupeCount = data.duplicates || 0;
      const newCount = data.parsed - dupeCount;
      let title;
      if (newCount === 0) {
        title = `♻️ Already on the calendar (${dupeCount} duplicate${dupeCount > 1 ? 's' : ''} skipped)`;
      } else if (dupeCount > 0) {
        title = `✅ Created ${newCount} · ♻️ ${dupeCount} duplicate${dupeCount > 1 ? 's' : ''} skipped`;
      } else if (recurringCount > 0 && newCount === recurringCount) {
        // Every new item is a recurring series.
        title = `✅ Created ${newCount} recurring training series${newCount > 1 ? 'es' : ''} 🔁`;
      } else {
        title = `✅ Created ${newCount} training event${newCount > 1 ? 's' : ''}`;
        if (recurringCount > 0) title += ` (${recurringCount} recurring 🔁)`;
      }
      const color = newCount === 0 ? 0x9BB0C4 : COLORS.GOLD;
      const successEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `AFF Concierge · Parsed by ${message.author.displayName || message.author.username}` });

      // Reply in the original channel
      await message.reply({ embeds: [successEmbed] });

      // Also post in the admin activity channel so the team can see —
      // but only when something actually changed. A pure-duplicate post
      // is just noise in the activity channel.
      if (newCount > 0 && adminChannelId && message.channelId !== adminChannelId) {
        const activityChannel = await client.channels.fetch(adminChannelId).catch(() => null);
        if (activityChannel?.isTextBased()) {
          const activityEmbed = new EmbedBuilder()
            .setColor(COLORS.GOLD)
            .setTitle(`📅 ${newCount} Training Event${newCount > 1 ? 's' : ''} Added`)
            .setDescription(lines.join('\n'))
            .setFooter({ text: `Parsed from flyer uploaded by ${message.author.displayName || message.author.username}` })
            .setTimestamp();
          if (image.url) activityEmbed.setThumbnail(image.url);
          await activityChannel.send({ embeds: [activityEmbed] }).catch(() => {});
        }
      }
    } else {
      // Training flyer parser found nothing. Before giving up, try
      // the contest-flyer parser — admins drop $500-bonus-style
      // flyers in the same channel and we want them auto-converted
      // into draft contests. The contest endpoint classifies +
      // creates inactive (admin reviews + activates).
      try {
        const contestForm = new FormData();
        contestForm.append('image', new Blob([buffer], { type: image.contentType || 'image/jpeg' }), image.name || 'flyer.jpg');
        const contestRes = await fetch(`${baseUrl}/api/admin/contests/from-flyer`, {
          method: 'POST',
          body: contestForm,
          headers: { 'x-cron-secret': process.env.CRON_SECRET || '' },
        });
        const contestData = await contestRes.json();
        if (contestRes.ok && contestData.kind === 'contest' && contestData.contestId) {
          const c = contestData.contest;
          const reqLines = (c.requirements || []).map((r, i) => `  ${i + 1}. ${r.label}`).join('\n');
          const windowText = c.anchor === 'FIXED'
            ? `${c.fixedStartAt ? new Date(c.fixedStartAt).toLocaleDateString() : '?'} → ${c.fixedEndAt ? new Date(c.fixedEndAt).toLocaleDateString() : '?'}`
            : `${c.durationDays ?? '?'} days from ${c.anchor.toLowerCase().replace('_', ' ')}`;
          const successEmbed = new EmbedBuilder()
            .setColor(COLORS.GOLD)
            .setTitle(`🏆 Draft contest created: ${c.title}`)
            .setDescription(`**Reward:** ${c.rewardLabel || (c.rewardAmount ? `$${c.rewardAmount}` : '—')}\n**Window:** ${windowText}\n\n**Requirements:**\n${reqLines}\n\n*Inactive until you review + activate at* ${baseUrl}/vault/contests`)
            .setFooter({ text: `AFF Concierge · Parsed from flyer by ${message.author.displayName || message.author.username}` });
          await message.reply({ embeds: [successEmbed] });
          await message.react('🏆').catch(() => {});
        } else {
          // Not a contest either. Be quiet — don't reply with the
          // 'could not parse' message because the image may have
          // been intentional (a meeting flyer, a screenshot, etc.)
          // and we don't want to keep yelling at the admin.
          await message.react('👀').catch(() => {});
        }
      } catch (err) {
        // Network error or 5xx — fall back to the original noisy
        // reply so the admin knows something is wrong.
        await message.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xf87171)
            .setTitle('Could not parse this flyer')
            .setDescription(`Tried as both a training flyer and a contest flyer; neither parser could read it.\n\n${err.message || 'unknown error'}`)
            .setFooter({ text: 'AFF Concierge' })
          ],
        });
      }
    }
  } catch (err) {
    await message.reactions.cache.get('⏳')?.remove().catch(() => {});
    await message.reply(`Failed to parse: ${err.message}`).catch(() => {});
  }
});

// ─── Ready ───────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ AFF Concierge online as ${c.user.tag}`);

  // Auto-register slash commands on every startup so a Railway
  // redeploy is all that's needed to pick up new/changed commands.
  // Guild-scoped, so updates appear instantly. Non-fatal: a
  // registration failure logs but never stops the bot.
  try {
    const appId = c.application?.id || process.env.DISCORD_CLIENT_ID;
    if (!appId) throw new Error('No application id (set DISCORD_CLIENT_ID)');
    const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(appId, GUILD_ID),
      { body: commands },
    );
    console.log(`✅ Registered ${commands.length} slash commands (guild ${GUILD_ID}).`);
  } catch (err) {
    console.error('⚠️  Slash command registration failed:', err?.message || err);
  }

  startLeaderboardSchedule(c);
});

// ─── Daily leaderboard schedule ──────────────────────────────────────────────
// Fires every day at 9 AM ET. Checked every 15 minutes so we never miss the
// window by more than a quarter-hour. The "already fired today" guard prevents
// duplicate posts if the bot restarts mid-morning.
let leaderboardLastFiredDate = null;

function startLeaderboardSchedule(c) {
  function check() {
    const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const isAfter9AM = etNow.getHours() >= 9;
    const todayKey = etNow.toDateString();
    if (isAfter9AM && leaderboardLastFiredDate !== todayKey) {
      leaderboardLastFiredDate = todayKey;
      postLeaderboard(c).catch(err => console.error('[Leaderboard] Post failed:', err));
    }
  }
  check();
  setInterval(check, 15 * 60 * 1000);
}

client.login(process.env.DISCORD_BOT_TOKEN);

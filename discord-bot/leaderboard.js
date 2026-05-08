// Monthly leaderboard post for #leaderboard channel.
// Fetches from /api/admin/leaderboard/discord-snapshot and posts a single embed
// with 3 tab buttons: Production | Recruits | Phase Movers.
//
// The message edits in place each day. Button clicks switch the active view.
// Phase history is persisted in phases-cache.json between runs.

require('./load-env');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { CHANNELS, COLORS } = require('./config');
const fs = require('fs');
const path = require('path');

const PHASES_CACHE_PATH = path.join(__dirname, 'phases-cache.json');
const MEDAL = ['🥇', '🥈', '🥉'];
const PHASE_UP_EMOJI = { 2: '📚', 3: '🎯', 4: '🚀', 5: '👑' };

function loadPhasesCache() {
  try { return JSON.parse(fs.readFileSync(PHASES_CACHE_PATH, 'utf8')); }
  catch { return {}; }
}

function savePhasesCache(data) {
  fs.writeFileSync(PHASES_CACHE_PATH, JSON.stringify(data, null, 2));
}

function rankLine(i, name, value, unit) {
  const prefix = i < 3 ? MEDAL[i] : `${i + 1}.`;
  const padded = name.length > 22 ? name.slice(0, 21) + '…' : name.padEnd(22);
  const plural = value !== 1 ? unit + 's' : unit;
  return `${prefix}  \`${padded}\`  **${value}** ${plural}`;
}

function updatedLine() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    hour12: true,
  });
}

// Build the three embeds + detect phase movers from fetched data.
// Returns { prodEmbed, recruitEmbed, moversEmbed | null, hasMoved }.
function buildEmbeds(data) {
  const { submissions, recruits, agents, totalSubmissions, activeSubmitters } = data;
  const monthLabel = data.monthLabel || data.weekLabel || 'This Month';
  const updatedAt = updatedLine();

  // Production
  const subLines = submissions.map((r, i) => rankLine(i, `${r.firstName} ${r.lastName}`, r.value, 'app')).join('\n');
  const submissionSummary = totalSubmissions > 0
    ? `${totalSubmissions} total app${totalSubmissions !== 1 ? 's' : ''} · ${activeSubmitters} active agent${activeSubmitters !== 1 ? 's' : ''}`
    : 'No submissions recorded this month.';

  const prodEmbed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`🏆  Monthly Production · ${monthLabel}`)
    .setDescription(subLines || '_No submissions this month._')
    .setFooter({ text: `${submissionSummary}\nUpdated ${updatedAt} ET · allfinancialfreedom.com/agents/leaderboard` });

  // Recruits
  const recLines = recruits.map((r, i) => rankLine(i, `${r.firstName} ${r.lastName}`, r.value, 'recruit')).join('\n');
  const recruitEmbed = new EmbedBuilder()
    .setColor(COLORS.NAVY)
    .setTitle(`🤝  Top Recruiters · ${monthLabel}`)
    .setDescription(recLines || '_No new recruits this month._')
    .setFooter({ text: `Updated ${updatedAt} ET · allfinancialfreedom.com/agents/leaderboard` });

  // Phase movers
  const cachedPhases = loadPhasesCache();
  const movers = [];
  const newCache = {};
  for (const agent of agents) {
    newCache[agent.agentCode] = agent.phase;
    const prev = cachedPhases[agent.agentCode];
    if (typeof prev === 'number' && prev < agent.phase) {
      movers.push({ ...agent, prevPhase: prev });
    }
  }
  savePhasesCache(newCache);

  let moversEmbed;
  if (movers.length > 0) {
    const moverLines = movers.map(m => {
      const emoji = PHASE_UP_EMOJI[m.phase] ?? '⬆️';
      return `${emoji}  **${m.firstName} ${m.lastName}**  Phase ${m.prevPhase} → Phase ${m.phase}  🎉`;
    }).join('\n');
    moversEmbed = new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle(`🌱  Phase Movers · ${monthLabel}`)
      .setDescription(moverLines)
      .setFooter({ text: `Updated ${updatedAt} ET` });
  } else {
    moversEmbed = new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle(`🌱  Phase Movers · ${monthLabel}`)
      .setDescription('_No phase changes recorded yet this month._')
      .setFooter({ text: `Updated ${updatedAt} ET` });
  }

  return { prodEmbed, recruitEmbed, moversEmbed };
}

// Build the tab button row. activeView: 'production' | 'recruits' | 'movers'
function buildButtons(activeView) {
  const row = new ActionRowBuilder();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId('lb_production')
      .setLabel('🏆 Production')
      .setStyle(activeView === 'production' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('lb_recruits')
      .setLabel('🤝 Recruits')
      .setStyle(activeView === 'recruits' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('lb_movers')
      .setLabel('🌱 Phase Movers')
      .setStyle(activeView === 'movers' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  return row;
}

// Fetch data from the API. Returns parsed JSON or throws.
async function fetchLeaderboardData() {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://allfinancialfreedom.com';
  const secret = process.env.CRON_SECRET || '';
  const res = await fetch(`${baseUrl}/api/admin/leaderboard/discord-snapshot`, {
    headers: { 'x-cron-secret': secret },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// Scheduled post: runs daily, edits the existing bot message in place.
async function postLeaderboard(client) {
  let data;
  try {
    data = await fetchLeaderboardData();
  } catch (err) {
    console.error('[Leaderboard] Failed to fetch snapshot:', err.message);
    return;
  }

  const channel = await client.channels.fetch(CHANNELS.LEADERBOARD).catch(() => null);
  if (!channel?.isTextBased()) {
    console.error('[Leaderboard] Could not fetch #leaderboard channel');
    return;
  }

  const { prodEmbed, recruitEmbed, moversEmbed } = buildEmbeds(data);
  const components = [buildButtons('recruits')];

  const recent = await channel.messages.fetch({ limit: 20 });
  const existing = recent.find(m => m.author.id === client.user.id && m.embeds.length > 0);

  if (existing) {
    await existing.edit({ embeds: [recruitEmbed], components });
    console.log(`[Leaderboard] Updated monthly snapshot (${data.submissions.length} producers, ${data.recruits.length} recruiters)`);
  } else {
    await channel.send({ embeds: [recruitEmbed], components });
    console.log(`[Leaderboard] Posted monthly snapshot (${data.submissions.length} producers, ${data.recruits.length} recruiters)`);
  }

  // Store embeds on client so button handler can access them without re-fetching
  client._leaderboardCache = { prodEmbed, recruitEmbed, moversEmbed };
}

// Button interaction handler — call this from bot.js interactionCreate.
// Returns true if the interaction was a leaderboard button and was handled.
async function handleLeaderboardButton(interaction) {
  const id = interaction.customId;
  if (!['lb_production', 'lb_recruits', 'lb_movers'].includes(id)) return false;

  await interaction.deferUpdate();

  // Fetch fresh data for the button click so it's always current
  let data;
  try {
    data = await fetchLeaderboardData();
  } catch (err) {
    console.error('[Leaderboard] Button fetch failed:', err.message);
    await interaction.followUp({ content: 'Could not load leaderboard data right now. Try again in a moment.', ephemeral: true });
    return true;
  }

  const { prodEmbed, recruitEmbed, moversEmbed } = buildEmbeds(data);

  const view = id === 'lb_production' ? 'production' : id === 'lb_recruits' ? 'recruits' : 'movers';
  const embed = view === 'production' ? prodEmbed : view === 'recruits' ? recruitEmbed : moversEmbed;

  await interaction.editReply({
    embeds: [embed],
    components: [buildButtons(view)],
  });

  return true;
}

module.exports = { postLeaderboard, handleLeaderboardButton };

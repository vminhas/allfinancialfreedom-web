// Weekly leaderboard post for #leaderboard channel.
// Fetches from /api/admin/leaderboard/discord-snapshot and posts 2-3 embeds:
//   1. Weekly Production (submissions)
//   2. Top Recruiters
//   3. Phase Movers (only when agents advanced a phase since last post)
//
// Called from bot.js on a Monday 9 AM ET schedule.
// Phase history is persisted in phases-cache.json between runs.

require('./load-env');
const { EmbedBuilder } = require('discord.js');
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
  // Monospace-friendly: pad name to 22 chars
  const padded = name.length > 22 ? name.slice(0, 21) + '…' : name.padEnd(22);
  const plural = value !== 1 ? unit + 's' : unit;
  return `${prefix}  \`${padded}\`  **${value}** ${plural}`;
}

async function postWeeklyLeaderboard(client) {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://allfinancialfreedom.com';
  const secret = process.env.CRON_SECRET || '';

  let data;
  try {
    const res = await fetch(`${baseUrl}/api/admin/leaderboard/discord-snapshot`, {
      headers: { 'x-cron-secret': secret },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    data = await res.json();
  } catch (err) {
    console.error('[Leaderboard] Failed to fetch snapshot:', err.message);
    return;
  }

  const channel = await client.channels.fetch(CHANNELS.LEADERBOARD).catch(() => null);
  if (!channel?.isTextBased()) {
    console.error('[Leaderboard] Could not fetch #leaderboard channel');
    return;
  }

  const { weekLabel, submissions, recruits, agents, totalSubmissions, activeSubmitters } = data;

  // ── Production embed ────────────────────────────────────────────────────────
  const subLines = submissions.map((r, i) => rankLine(i, `${r.firstName} ${r.lastName}`, r.value, 'app')).join('\n');
  const footer = totalSubmissions > 0
    ? `${totalSubmissions} total app${totalSubmissions !== 1 ? 's' : ''} · ${activeSubmitters} active agent${activeSubmitters !== 1 ? 's' : ''}`
    : 'No submissions recorded this week.';

  const prodEmbed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`🏆  Weekly Production · ${weekLabel}`)
    .setDescription(subLines || '_No submissions this week._')
    .setFooter({ text: footer });

  // ── Recruits embed ──────────────────────────────────────────────────────────
  const recLines = recruits.map((r, i) => rankLine(i, `${r.firstName} ${r.lastName}`, r.value, 'recruit')).join('\n');

  const recruitEmbed = new EmbedBuilder()
    .setColor(COLORS.NAVY)
    .setTitle(`🤝  Top Recruiters · ${weekLabel}`)
    .setDescription(recLines || '_No new recruits this week._');

  // ── Phase movers embed ──────────────────────────────────────────────────────
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

  const embeds = [prodEmbed, recruitEmbed];

  if (movers.length > 0) {
    const moverLines = movers.map(m => {
      const emoji = PHASE_UP_EMOJI[m.phase] ?? '⬆️';
      return `${emoji}  **${m.firstName} ${m.lastName}**  Phase ${m.prevPhase} → Phase ${m.phase}  🎉`;
    }).join('\n');

    const moversEmbed = new EmbedBuilder()
      .setColor(COLORS.NAVY)
      .setTitle(`🌱  Phase Movers · ${weekLabel}`)
      .setDescription(moverLines);

    embeds.push(moversEmbed);
  }

  await channel.send({ embeds });
  console.log(`[Leaderboard] Posted weekly snapshot for ${weekLabel} (${submissions.length} top producers, ${recruits.length} top recruiters, ${movers.length} phase movers)`);
}

module.exports = { postWeeklyLeaderboard };

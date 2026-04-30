// Auto-reactions for celebration-worthy messages in the AFF channels.
// The Concierge bot listens for new messages, classifies them into one
// of a few celebration categories, and reacts with a small emoji set
// so wins, shoutouts, and morning greetings feel acknowledged without
// requiring every teammate to react manually.
//
// Categories detected (in priority order, highest first):
//   big_win   - new business / first license / comma check / "N for
//               the team" / "M personal" / qualifier / onboarded BP
//   congrats  - explicit congratulations or shoutouts: "congrats",
//               "shoutout", "let's go {name}", "way to go", "proud of"
//   morning   - daily greeting: "good morning everyone", "happy
//               {weekday}", "magnificent monday", "terrific tuesday"
//   action    - action-required pings: "ACTION REQUIRED", "deadline",
//               "don't miss", 🚨, ⚠️
//   meeting   - zoom link / "starting in N minutes" / "opening zoom"
//
// Throttling: we cap to 3 reactions per author per rolling 5-minute
// window so a flurry of posts doesn't turn into a wall of bot emoji.
//
// Channel scoping: opt-in by channel ID list (DISCORD_REACT_CHANNELS
// env var, comma separated) so this only fires where the team wants.
// Empty/unset = enabled in all guild channels except the admin
// channel and DMs. Easy kill-switch via DISCORD_REACT_DISABLED=1.

const REACTION_POOLS = {
  big_win: [
    ['🎉', '🔥', '🚀'],
    ['💪', '🔥', '💯'],
    ['🎉', '💪', '👏'],
    ['🚀', '🔥', '🥳'],
    ['🏆', '🎉', '🔥'],
  ],
  congrats: [
    ['👏', '🎉'],
    ['❤️', '🎉'],
    ['🥳', '👏'],
    ['🎉', '🔥'],
    ['👏', '🚀'],
  ],
  morning: [
    ['☀️', '❤️'],
    ['☀️', '💪'],
    ['🌅', '🔥'],
  ],
  action: [
    ['👀', '✅'],
    ['👀', '🙏'],
  ],
  meeting: [
    ['📅', '🔗'],
    ['🎥', '⏰'],
  ],
};

// Detection regexes ordered by priority. First match wins, so big-win
// signals override generic congrats. The patterns are deliberately
// conservative - false positives are worse than misses because the
// bot reacting to the wrong thing reads as tone-deaf.
const PATTERNS = [
  {
    kind: 'big_win',
    re: /\bbusiness partner\b|\bonboarded\b|\bfirst (license|business|deal|app|client|policy)\b|\bcomma check\b|\bqualif(y|ier|ied)\b|\bnet licensed?\b|\b\d+ for the team\b|\b\d+ personal\b|moral authority|just got (their|his|her) first/i,
  },
  {
    kind: 'congrats',
    re: /\bcongrats\b|\bcongratulations\b|\bshout ?out\b|\blet'?s go\s+@|\bway to go\b|\bproud of you\b|\bnice work\b|\bgreat job\b|\bbig (?:up|win)\b|\bboom\b|\b🥳/i,
  },
  {
    kind: 'morning',
    re: /\bgood morning(?: everyone)?\b|\bhappy (?:monday|tuesday|wednesday|thursday|friday)\b|\bmagnificent monday\b|\bterrific tuesday\b|\bwins?day wednesday\b|\bthankful thursday\b|\bfantastic friday\b/i,
  },
  {
    kind: 'action',
    re: /\baction required\b|\bdeadline\b|\bdon'?t miss\b|\bplease (?:read|don'?t miss|update|complete)\b|🚨|⚠️/,
  },
  {
    kind: 'meeting',
    re: /zoom\.us\/j\/|opening my zoom|starting in \d+ minutes?|live in \d+ minutes?|\bjoin (?:us )?(?:on )?zoom\b/i,
  },
];

function detectCelebrationKind(content) {
  if (!content) return null;
  for (const { kind, re } of PATTERNS) {
    if (re.test(content)) return kind;
  }
  return null;
}

function pickReactions(kind) {
  const pools = REACTION_POOLS[kind];
  if (!pools || pools.length === 0) return [];
  return pools[Math.floor(Math.random() * pools.length)];
}

// Per-author throttle. authorId -> array of timestamps within the
// rolling window. Cleaned up on each call.
const THROTTLE_WINDOW_MS = 5 * 60 * 1000;
const THROTTLE_MAX = 3;
const recentByAuthor = new Map();

function throttled(authorId) {
  const now = Date.now();
  const arr = recentByAuthor.get(authorId) ?? [];
  const fresh = arr.filter(t => now - t < THROTTLE_WINDOW_MS);
  if (fresh.length >= THROTTLE_MAX) {
    recentByAuthor.set(authorId, fresh);
    return true;
  }
  fresh.push(now);
  recentByAuthor.set(authorId, fresh);
  return false;
}

// Channel scope. If DISCORD_REACT_CHANNELS is set (comma-separated
// IDs) we only react in those channels. Otherwise, react in every
// guild channel except the admin channel.
function isAllowedChannel(message) {
  if (!message.guild) return false; // skip DMs
  const allowList = (process.env.DISCORD_REACT_CHANNELS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowList.length > 0) return allowList.includes(message.channelId);
  // Default: skip the admin channel (let humans curate that space).
  if (process.env.DISCORD_ADMIN_CHANNEL_ID && message.channelId === process.env.DISCORD_ADMIN_CHANNEL_ID) return false;
  return true;
}

// Main entrypoint - call from the MessageCreate handler in bot.js.
async function maybeReactToMessage(message) {
  if (process.env.DISCORD_REACT_DISABLED === '1') return;
  if (!isAllowedChannel(message)) return;

  // Bot messages get a separate, more selective path: we react to OUR
  // OWN celebration embeds (promotion announcements, new agent
  // approved, etc.) but not to the bot's general chatter. Other bots
  // are skipped entirely.
  if (message.author.bot) {
    if (message.author.id !== message.client.user.id) return;
    await maybeReactToOwnEmbed(message);
    return;
  }

  const kind = detectCelebrationKind(message.content);
  if (!kind) return;

  if (throttled(message.author.id)) return;

  const reactions = pickReactions(kind);
  for (const emoji of reactions) {
    try {
      await message.react(emoji);
      // Tiny stagger so the reactions appear one-by-one for a more
      // natural "the team is reacting" feel rather than a single
      // robotic burst.
      await new Promise(r => setTimeout(r, 250));
    } catch {
      // Reaction failed (rate limit, missing perms, removed message).
      // Drop it silently - one missing emoji isn't worth retry logic.
    }
  }
}

// React to the bot's own celebratory embeds. Fires for things the
// Vercel-side code posts via sendChannelMessage (promotion events,
// new agent approved, etc.) so those announcements get auto-loved
// even without a human reacting.
async function maybeReactToOwnEmbed(message) {
  const embed = message.embeds?.[0];
  if (!embed) return;
  const haystack = `${embed.title ?? ''} ${embed.description ?? ''}`.toLowerCase();
  // Match the same set the Vercel side uses for celebration embeds.
  let kind = null;
  if (/promoted to phase|new agent activated|new agent approved|🎉/.test(haystack)) kind = 'big_win';
  else if (/intro sent|reminder sent|welcome/.test(haystack)) kind = 'congrats';
  if (!kind) return;
  for (const emoji of pickReactions(kind)) {
    try {
      await message.react(emoji);
      await new Promise(r => setTimeout(r, 250));
    } catch { /* drop silently */ }
  }
}

module.exports = { maybeReactToMessage, detectCelebrationKind, pickReactions };

// Standalone test for the Discord posting allowlist.
// Run: npx tsx scripts/test-discord-posting.mts
import { discordPostAllowed } from '../src/lib/discord-posting.ts'

let failures = 0
const check = (label: string, got: boolean, want: boolean) => {
  const ok = got === want
  if (!ok) failures++
  console.log(`${ok ? '✅' : '❌'} ${label}  (got ${got}, want ${want})`)
}

const ANNOUNCEMENTS = '1295044213590982724'
const TRAINING     = '1295044213590982725'
const LEADERBOARD  = '1502131631580909589'
const BLOG         = '1492988923339870270'
const ADMIN_ACT    = '1497704771149107385'
const AGENT_ACT    = '1501070249695383622'
const LC_ACT       = '1503502232669389030'

delete process.env.DISCORD_POSTS_ALLOW_ALL
delete process.env.DISCORD_ADMIN_CHANNEL_ID
delete process.env.DISCORD_AGENT_ACTIVITY_CHANNEL_ID
delete process.env.DISCORD_LC_ACTIVITY_CHANNEL_ID

// Public channels must be silenced.
check('#announcements blocked', discordPostAllowed(ANNOUNCEMENTS), false)
check('#training blocked',      discordPostAllowed(TRAINING),      false)
check('#leaderboard blocked',   discordPostAllowed(LEADERBOARD),   false)
check('#blog blocked',          discordPostAllowed(BLOG),          false)

// Activity feeds must keep working, even with env vars unset (fallback ids).
check('#admin-activity allowed (fallback)', discordPostAllowed(ADMIN_ACT), true)
check('#agent-activity allowed (fallback)', discordPostAllowed(AGENT_ACT), true)
check('#lc-activity allowed (fallback)',    discordPostAllowed(LC_ACT),    true)

// DM channels are created per-conversation, so they are never allowlisted.
check('DM channel id blocked', discordPostAllowed('1399999999999999999'), false)
check('empty channel blocked', discordPostAllowed(''),        false)
check('null channel blocked',  discordPostAllowed(null),      false)

// An env-configured admin channel is honored.
process.env.DISCORD_ADMIN_CHANNEL_ID = '2222222222222222222'
check('env-configured admin channel allowed', discordPostAllowed('2222222222222222222'), true)
check('whitespace tolerated', discordPostAllowed(' 2222222222222222222 '), true)
check('announcements still blocked after env set', discordPostAllowed(ANNOUNCEMENTS), false)

// Global restore escape hatch.
process.env.DISCORD_POSTS_ALLOW_ALL = '1'
check('ALLOW_ALL restores announcements', discordPostAllowed(ANNOUNCEMENTS), true)
check('ALLOW_ALL restores DMs',           discordPostAllowed('1399999999999999999'), true)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)

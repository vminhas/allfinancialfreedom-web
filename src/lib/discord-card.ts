// Shared "achievement card" builder for the Discord card family.
//
// Lifts the visual language from the original `✦ MILESTONE ✦` post that
// fired on phase-item completions into a reusable embed factory. Every
// flavor (MILESTONE, PROMOTION, NEW RECRUIT, RECOGNITION, ELITE_TRAINER,
// POLICY_ISSUED, …) renders with the same shape:
//
//   ┌───────────────────────────────────────────┐
//   │  <FLAVOR HEADER LABEL>            [avatar]│
//   │                                           │
//   │  # First Last                             │
//   │  <subline copy>                           │
//   │                                           │
//   │  Field A                Field B           │
//   │  …                      …                 │
//   │                                           │
//   │  All Financial Freedom · <closer>         │
//   └───────────────────────────────────────────┘
//
// New flavors are a one-line addition to the FLAVORS map below — the
// audit prompt's helper signature is preserved verbatim so future
// flavors don't require touching every call site.

import type { DiscordEmbed } from './discord'
import { displayFirstName } from './display-name'

export type CardFlavor =
  | 'MILESTONE'             // phase-item announcement (the prototype)
  | 'PROMOTION'             // phase change
  | 'NEW_RECRUIT'           // referral submitted
  | 'RECOGNITION'           // RecognitionMilestone awarded (non-Elite)
  | 'ELITE_TRAINER'         // Elite Trainer milestone (bespoke header copy)
  | 'POLICY_ISSUED'         // first / new policy issued
  | 'NEW_BUSINESS_PARTNER'  // contact classified as Business Partner

interface FlavorMeta {
  // Header label rendered as the embed title — kept short and visually
  // consistent with the prototype's `✦  M I L E S T O N E  ✦`. The
  // letter-spacing is baked into the strings so the title bar reads as
  // a banner rather than a sentence.
  title: string
  // Default accent color when no override is passed. PROMOTION supplies
  // its own accent (phase color) via accentOverride.
  defaultAccent: number
  // Closing line in the footer ("Way to go!", "Welcome to AFF", etc.).
  // Brand prefix "All Financial Freedom · " is added automatically.
  footerCloser: string
}

const FLAVORS: Record<CardFlavor, FlavorMeta> = {
  // MILESTONE used to default to gold (0xC9A96E), which collided with
  // Phase-3 promotions (CFT advancement also renders gold). Switched
  // to a soft platinum so milestone posts read as visually distinct
  // from any phase-color promotion. Gold is now reserved for Phase-3
  // promotions and the RECOGNITION (non-Elite milestone) flavor.
  MILESTONE:             { title: '✦  M I L E S T O N E  ✦',         defaultAccent: 0xCBD5E1, footerCloser: 'Way to go!' },
  PROMOTION:             { title: '↑  P R O M O T I O N',             defaultAccent: 0xC9A96E, footerCloser: "Onward and upward!" },
  NEW_RECRUIT:           { title: '🎉  N E W   R E C R U I T',        defaultAccent: 0x4ADE80, footerCloser: 'Welcome to the family.' },
  RECOGNITION:           { title: '🏆  R E C O G N I T I O N',        defaultAccent: 0xC9A96E, footerCloser: 'Earned and well-deserved.' },
  ELITE_TRAINER:         { title: '✨  E L I T E   T R A I N E R  ✨', defaultAccent: 0xE6C26F, footerCloser: 'A rare achievement.' },
  POLICY_ISSUED:         { title: '📈  P O L I C Y   I S S U E D',     defaultAccent: 0x4ADE80, footerCloser: 'Another family helped.' },
  NEW_BUSINESS_PARTNER:  { title: '🤝  N E W   P A R T N E R',         defaultAccent: 0x4ADE80, footerCloser: 'Welcome to the team.' },
}

export interface AchievementProtagonist {
  firstName: string
  lastName: string
  // Agent-set "I go by" override for first name. Headline renders
  // "{preferredName ?? firstName} {lastName}".
  preferredName?: string | null
  agentCode?: string | null
  avatarUrl?: string | null
}

export interface BuildAchievementEmbedArgs {
  flavor: CardFlavor
  protagonist: AchievementProtagonist
  // Optional override for the headline. Default is "# {firstName} {lastName}".
  headline?: string
  // Body copy below the headline. e.g. "Completed **Connect Discord**",
  // "Promoted to **CFT**", "Welcome to AFF, Sarah!".
  // Per project convention, no em-dashes — use commas, periods, or `·`.
  subline: string
  // Optional structured fields, rendered in the embed below the body.
  fields?: Array<{ name: string; value: string; inline?: boolean }>
  // Phase-color accent override for PROMOTION, or any future flavor
  // that wants to dynamically colorize per event.
  accentOverride?: number
  // Mention strings to prepend the embed with (e.g. <@discordUserId>
  // for the recruiter on a NEW_RECRUIT card). Keeps the body clean
  // while still routing a Discord notification to the tagged user.
  mentions?: string[]
}

export function buildAchievementEmbed(args: BuildAchievementEmbedArgs): DiscordEmbed {
  const meta = FLAVORS[args.flavor]
  const first = displayFirstName(args.protagonist)
  const fullName = `${first} ${args.protagonist.lastName}`.trim()
  const headline = args.headline ?? `# ${fullName}`
  return {
    title: meta.title,
    description: `${headline}\n${args.subline}`,
    color: args.accentOverride ?? meta.defaultAccent,
    fields: args.fields,
    thumbnail: args.protagonist.avatarUrl ? { url: args.protagonist.avatarUrl } : undefined,
    footer: { text: `All Financial Freedom · ${meta.footerCloser}` },
    timestamp: new Date().toISOString(),
  }
}

// Phase color palette, kept in sync with progress/route.ts so promotion
// cards and the activity-channel feed share visual identity.
export const PHASE_ACCENT: Record<number, number> = {
  1: 0x60a5fa, // blue   (Agent → Associate)
  2: 0x4ade80, // green  (Associate → CFT)
  3: 0xC9A96E, // gold   (CFT → MD)
  4: 0xa78bfa, // purple (MD → EMD)
  5: 0xf472b6, // pink   (EMD → NVP)
  6: 0xfbbf24, // amber  (NVP)
}

// Title earned by completing the PREVIOUS phase (you have to be in
// the next phase to hold the current title). Phase 1 agents have
// no earned title yet — fall through to a generic 'Phase 1' label
// at call sites.
// Deprecated for title rendering. Use resolveAgentTitle from
// `@/lib/agent-title` instead — title is now driven by the rank
// promotion items the agent has completed, not their phase number.
// Every entry maps to 'Associate' (the universal starting title) so any
// stale lookup degrades gracefully rather than showing 'Agent' or a
// phase-derived label that contradicts the resolver.
export const PHASE_TITLE: Record<number, string> = {
  1: 'Associate', 2: 'Associate', 3: 'Associate', 4: 'Associate', 5: 'Associate', 6: 'Associate',
}

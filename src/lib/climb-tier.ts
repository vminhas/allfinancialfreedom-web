// Tier accent mapping for The Climb. As an agent climbs through
// milestones the page's accent color rolls bronze → silver → gold →
// platinum. Pure visual; doesn't change semantics. Tunable here.
//
// Tier index = number of achievements earned (0 = no climb yet,
// max = total active milestones). We bucket into 4 bands so the
// color shifts feel meaningful rather than continuous noise.

export interface ClimbTier {
  key: 'unranked' | 'bronze' | 'silver' | 'gold' | 'platinum'
  label: string
  accent: string       // hex
  glow: string         // rgba shadow
  gradient: string     // CSS gradient for badges/banners
}

export const CLIMB_TIERS: Record<ClimbTier['key'], ClimbTier> = {
  unranked: {
    key: 'unranked',
    label: 'Starting Out',
    accent: '#6B8299',
    glow: 'rgba(107,130,153,0.25)',
    gradient: 'linear-gradient(135deg, #4A5868, #6B8299)',
  },
  bronze: {
    key: 'bronze',
    label: 'Bronze Climber',
    accent: '#A88C44',
    glow: 'rgba(168,140,68,0.35)',
    gradient: 'linear-gradient(135deg, #6B4F1F, #A88C44)',
  },
  silver: {
    key: 'silver',
    label: 'Silver Climber',
    accent: '#C9A96E',
    glow: 'rgba(201,169,110,0.4)',
    gradient: 'linear-gradient(135deg, #8B6F2E, #C9A96E)',
  },
  gold: {
    key: 'gold',
    label: 'Gold Climber',
    accent: '#E0BC52',
    glow: 'rgba(224,188,82,0.5)',
    gradient: 'linear-gradient(135deg, #C9A96E, #E0BC52)',
  },
  platinum: {
    key: 'platinum',
    label: 'Summit Climber',
    accent: '#FFD700',
    glow: 'rgba(255,215,0,0.55)',
    gradient: 'linear-gradient(135deg, #E0BC52, #FFD700)',
  },
}

export function climbTierFor(achievementCount: number, totalMilestones: number): ClimbTier {
  if (achievementCount === 0) return CLIMB_TIERS.unranked
  if (totalMilestones <= 0) return CLIMB_TIERS.bronze
  const ratio = achievementCount / totalMilestones
  if (ratio >= 1) return CLIMB_TIERS.platinum
  if (ratio >= 0.66) return CLIMB_TIERS.gold
  if (ratio >= 0.33) return CLIMB_TIERS.silver
  return CLIMB_TIERS.bronze
}

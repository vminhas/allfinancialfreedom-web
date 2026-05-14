// AFF Concierge - Server Configuration
// Updated May 2026 to match current channel structure

module.exports = {
  GUILD_ID: '1295044213360296048',

  CHANNELS: {
    RULES:              '1295044213590982721',
    ANNOUNCEMENTS:      '1295044213590982724',
    FAQ:                '1295044213590982722',
    TRAINING_SCHEDULE:  '1494170168731893800',
    TRAINING_REMINDERS: '1295044213590982725',
    RESOURCES:          '1295044213590982728',
    BLOG_ARTICLES:      '1492988923339870270',
    SOCIAL_MEDIA:       '1295044213754564610',
    LEADERBOARD:        '1502131631580909589',
    ADMIN_ACTIVITY:     '1497704771149107385',
    AGENT_ACTIVITY:     '1501070249695383622',
  },

  ROLES: {
    ADMIN:          '1295044213389393958',
    PHASE_1_STEP_1: '1295044213372883020',
    PHASE_1_STEP_2: '1295044213372883021',
    PHASE_1_STEP_3: '1295044213372883022',
    PHASE_2:        '1295044213372883024',
    PHASE_3:        '1295044213372883025',
    PHASE_4:        '1300845918937157652',
    LICENSED:       '1295044213360296053',
    // Granted to every member at server-join so they can see and interact
    // with all public channels immediately.
    AFF_MEMBER:     '1295044213360296057',
    // Granted by the portal when an agent links their Discord account.
    AFF_CONNECTED:  '1497712341364510933',
    // Legacy — may no longer exist; kept for reference only.
    REPRESENTATIVE: '1295044213372883017',
  },

  // Users allowed to edit bot messages (Admin role OR these user IDs)
  EDITORS: [
    '857638016074907649',   // Melinee Minhas
    '1248710966879715381',  // Karmvir (Vick) Minhas
  ],

  COLORS: {
    NAVY: 0x1a2744,
    GOLD: 0xC9A84C,
    WHITE: 0xFFFFFF,
  },
};

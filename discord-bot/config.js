// AFF Concierge - Server Configuration
// All IDs sourced from live server scout on April 12, 2026

module.exports = {
  GUILD_ID: '1295044213360296048',

  CHANNELS: {
    WELCOME:       '1295044213590982720',
    RULES:         '1295044213590982721',
    ANNOUNCEMENTS: '1295044213590982724',
    PHASE_1_STEP_1:'1295044213754564616',
    PHASE_1_STEP_2:'1295044213754564617',
    PHASE_1_STEP_3:'1295044213930459186',
    PHASE_2:       '1295044213930459187',
    PHASE_3:       '1295044213930459188',
    PHASE_4:       '1295044213930459189',
    // Blog articles channel ID — update after creating it in Discord
    BLOG_ARTICLES: null,
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
  },

  // Users allowed to edit bot messages (Admin role OR these user IDs)
  EDITORS: [
    '857638016074907649',   // Melinee Minhas
    '1248710966879715381',  // Karmvir (Vick) Minhas
  ],

  // AFF brand colors (hex → decimal for Discord embeds)
  COLORS: {
    NAVY: 0x1a2744,
    GOLD: 0xC9A84C,
    WHITE: 0xFFFFFF,
  },
};

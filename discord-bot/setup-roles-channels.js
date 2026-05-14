// One-shot setup: creates AFF Observer + Referral Partner roles, #get-started
// and #your-access channels, sets all permissions, and posts the initial messages.
//
// Run: node discord-bot/setup-roles-channels.js
require('./load-env');

const TOKEN   = process.env.DISCORD_BOT_TOKEN;
const GUILD   = '1295044213360296048';

// Existing role IDs — all denied on #get-started
const ROLES = {
  ADMIN:            '1295044213389393958',
  AFF_MEMBER:       '1295044213360296057',
  AFF_CONNECTED:    '1497712341364510933',
  LICENSED:         '1295044213360296053',
  PHASE_1_1:        '1295044213372883020',
  PHASE_1_2:        '1295044213372883021',
  PHASE_1_3:        '1295044213372883022',
  PHASE_2:          '1295044213372883024',
  PHASE_3:          '1295044213372883025',
  PHASE_4:          '1300845918937157652',
  CFT:              '1295044213372883026',
  SENIOR_ASSOCIATE: '1295044213372883019',
  ASSOCIATE:        '1295044213372883018',
  MD:               '1295044213389393950',
  EMD:              '1295044213389393956',
};

// Channels to configure
const CHANNELS = {
  WELCOME_CATEGORY:    '1494174976490868879',
  RULES:               '1295044213590982721',
  ANNOUNCEMENTS:       '1295044213590982724',
  TRAINING_SCHEDULE:   '1494170168731893800',
  TRAINING_REMINDERS:  '1295044213590982725',
  RESOURCES:           '1295044213590982728',
  BLOG_ARTICLES:       '1492988923339870270',
  LEADERBOARD:         '1502131631580909589',
  ADMIN_ACTIVITY:      '1497704771149107385',
};

const EVERYONE = GUILD;
const VIEW     = 1024n;
const SEND     = 2048n;
const HISTORY  = 65536n;
const REACT    = 64n;
const INTERACT = 2147483648n;

async function api(method, path, body) {
  while (true) {
    const res = await fetch('https://discord.com/api/v10' + path, {
      method,
      headers: {
        Authorization: 'Bot ' + TOKEN,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 429) {
      const d = await res.json();
      await new Promise(r => setTimeout(r, (d.retry_after + 0.1) * 1000));
      continue;
    }
    if (res.status === 204) return null;
    return res.json();
  }
}

async function setOverwrite(channelId, roleId, allow, deny) {
  await api('PUT', `/channels/${channelId}/permissions/${roleId}`, {
    type: 0, allow: allow.toString(), deny: deny.toString(),
  });
}

async function main() {
  // ── 1. Create roles ──────────────────────────────────────────────────────
  console.log('Creating roles...');

  const observerRole = await api('POST', `/guilds/${GUILD}/roles`, {
    name: 'AFF Observer', color: 0x6B7280, hoist: false, mentionable: false,
  });
  console.log('  AFF Observer:', observerRole.id);

  await new Promise(r => setTimeout(r, 500));

  const partnerRole = await api('POST', `/guilds/${GUILD}/roles`, {
    name: 'Referral Partner', color: 0xB8860B, hoist: false, mentionable: false,
  });
  console.log('  Referral Partner:', partnerRole.id);

  await new Promise(r => setTimeout(r, 500));

  const OBS_ID  = observerRole.id;
  const PART_ID = partnerRole.id;

  // ── 2. Create #get-started channel ──────────────────────────────────────
  console.log('\nCreating #get-started...');
  // Deny all named roles; allow @everyone to view (but not send)
  const denyAllRoles = [
    ...Object.values(ROLES), OBS_ID, PART_ID,
  ].map(id => ({ id, type: 0, allow: '0', deny: VIEW.toString() }));

  const getStartedCh = await api('POST', `/guilds/${GUILD}/channels`, {
    name: 'get-started',
    type: 0,
    parent_id: CHANNELS.WELCOME_CATEGORY,
    position: 0,
    topic: 'New to the server? Let us know you\'re here.',
    permission_overwrites: [
      { id: EVERYONE, type: 0, allow: (VIEW | HISTORY | REACT | INTERACT).toString(), deny: SEND.toString() },
      ...denyAllRoles,
    ],
  });
  console.log('  #get-started:', getStartedCh.id);

  await new Promise(r => setTimeout(r, 500));

  // ── 3. Create #your-access channel (AFF Observer only) ──────────────────
  console.log('Creating #your-access...');
  const yourAccessCh = await api('POST', `/guilds/${GUILD}/channels`, {
    name: 'your-access',
    type: 0,
    parent_id: CHANNELS.WELCOME_CATEGORY,
    topic: 'Limited access members — request full access here.',
    permission_overwrites: [
      { id: EVERYONE,  type: 0, allow: '0', deny: VIEW.toString() },
      { id: OBS_ID,    type: 0, allow: (VIEW | SEND | HISTORY | REACT | INTERACT).toString(), deny: '0' },
    ],
  });
  console.log('  #your-access:', yourAccessCh.id);

  await new Promise(r => setTimeout(r, 500));

  // ── 4. Set permissions for AFF Observer ─────────────────────────────────
  console.log('\nSetting AFF Observer permissions...');
  const FULL = VIEW | SEND | HISTORY | REACT | INTERACT;
  const VIEW_ONLY = VIEW | HISTORY | REACT;

  // Allow
  for (const [name, id] of [
    ['announcements',      CHANNELS.ANNOUNCEMENTS],
    ['training-schedule',  CHANNELS.TRAINING_SCHEDULE],
    ['training-reminders', CHANNELS.TRAINING_REMINDERS],
    ['rules',              CHANNELS.RULES],
  ]) {
    await setOverwrite(id, OBS_ID, VIEW_ONLY, 0n);
    console.log('  allow:', name);
    await new Promise(r => setTimeout(r, 300));
  }

  // Deny
  for (const [name, id] of [
    ['resources',    CHANNELS.RESOURCES],
    ['blog-articles',CHANNELS.BLOG_ARTICLES],
    ['leaderboard',  CHANNELS.LEADERBOARD],
  ]) {
    await setOverwrite(id, OBS_ID, 0n, VIEW);
    console.log('  deny:', name);
    await new Promise(r => setTimeout(r, 300));
  }

  // ── 5. Set permissions for Referral Partner ──────────────────────────────
  console.log('\nSetting Referral Partner permissions...');

  // Allow (view only — can't send in these channels)
  for (const [name, id] of [
    ['rules',             CHANNELS.RULES],
    ['announcements',     CHANNELS.ANNOUNCEMENTS],
    ['blog-articles',     CHANNELS.BLOG_ARTICLES],
    ['leaderboard',       CHANNELS.LEADERBOARD],
    ['training-schedule', CHANNELS.TRAINING_SCHEDULE],
  ]) {
    await setOverwrite(id, PART_ID, VIEW_ONLY, 0n);
    console.log('  allow:', name);
    await new Promise(r => setTimeout(r, 300));
  }

  // Deny
  for (const [name, id] of [
    ['training-reminders', CHANNELS.TRAINING_REMINDERS],
    ['resources',          CHANNELS.RESOURCES],
  ]) {
    await setOverwrite(id, PART_ID, 0n, VIEW);
    console.log('  deny:', name);
    await new Promise(r => setTimeout(r, 300));
  }

  // ── 6. Post #get-started welcome message ─────────────────────────────────
  console.log('\nPosting #get-started message...');
  await api('POST', `/channels/${getStartedCh.id}/messages`, {
    content: '',
    embeds: [{
      color: 0x1a2744,
      title: 'Welcome to All Financial Freedom',
      description: "You're almost in. Our team will get you set up with full access shortly.\n\nIf you need assistance right away, click the button below and someone from our team will reach out.",
      footer: { text: 'All Financial Freedom · Wealth · Protection · Legacy' },
    }],
    components: [{
      type: 1,
      components: [{
        type: 2, style: 1, label: 'Request Access', custom_id: 'request-access',
      }],
    }],
  });
  console.log('  posted.');

  // ── 7. Post #your-access message ─────────────────────────────────────────
  console.log('Posting #your-access message...');
  await api('POST', `/channels/${yourAccessCh.id}/messages`, {
    content: '',
    embeds: [{
      color: 0x1a2744,
      title: 'Your Access is Currently Limited',
      description: "You have access to announcements and training resources while your account is in limited-access mode.\n\nWhen you're ready to return to full portal access, use the button below. A member of our leadership team will review your request.",
      footer: { text: 'All Financial Freedom · Wealth · Protection · Legacy' },
    }],
    components: [{
      type: 1,
      components: [{
        type: 2, style: 1, label: 'Request Full Access', custom_id: 'request-reactivation',
      }],
    }],
  });
  console.log('  posted.');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`
=== Done ===
AFF Observer role ID:    ${OBS_ID}
Referral Partner role ID: ${PART_ID}
#get-started channel ID:  ${getStartedCh.id}
#your-access channel ID:  ${yourAccessCh.id}

Add these to config.js:
  AFF_OBSERVER:      '${OBS_ID}',
  REFERRAL_PARTNER:  '${PART_ID}',
`);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });

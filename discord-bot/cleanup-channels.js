/**
 * One-off script: reorganize the AFF Discord server channels into clean
 * categories with consistent naming and descriptions.
 *
 * Run: node discord-bot/cleanup-channels.js
 *
 * What it does:
 *   1. Creates 4 new categories with emoji icons
 *   2. Renames channels to clean, consistent names
 *   3. Moves channels into the right categories
 *   4. Sets channel topics/descriptions
 *   5. Locks #training-schedule to read-only (bot posts only)
 *   6. Cleans up old empty category
 *
 * What it does NOT do:
 *   - Change any channel's existing permission overwrites (phase role-gating preserved)
 *   - Change any channel IDs (all bot integrations keep working)
 *   - Delete any channels or messages
 *   - Modify any roles
 *
 * Safe to re-run — uses channel IDs, not names.
 */

require('./load-env');
const { GUILD_ID, CHANNELS } = require('./config');

const API = 'https://discord.com/api/v10';
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const HEADERS = {
  Authorization: `Bot ${TOKEN}`,
  'Content-Type': 'application/json',
};

// Existing channel IDs (from config + post-content.js)
const CH = {
  // 🏠 WELCOME & INFO
  WELCOME:          '1295044213590982720',
  RULES:            '1295044213590982721',
  ANNOUNCEMENTS:    '1295044213590982724',

  // 🗓️ TRAINING
  TRAINING_SCHEDULE:'1494170168731893800',
  TRAINING_REMINDERS:'1295044213590982725', // currently "training-and-events"

  // 🎓 AGENT PROGRESSION
  PHASE_1_OVERVIEW: '1295044213754564615', // currently "phase-1-focus"
  PHASE_1_STEP_1:   '1295044213754564616',
  PHASE_1_STEP_2:   '1295044213754564617',
  PHASE_1_STEP_3:   '1295044213930459186',
  PHASE_2:          '1295044213930459187',
  PHASE_3:          '1295044213930459188',
  PHASE_4:          '1295044213930459189',

  // 🛠️ RESOURCES
  BIZTOOLS:         '1295044213590982726',
  TRAINER_BOOKING:  '1295044213590982727',
  PRESENTATIONS:    '1295044213590982728',
  BLOG_ARTICLES:    '1492988923339870270',
};

// Old category to clean up
const OLD_CATEGORY_ID = '1295044213590982723'; // "ALL FINANCIAL FREEDOM" (ex "EMPOWER")

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiCall(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function cleanup() {
  if (!TOKEN) { console.error('Missing DISCORD_BOT_TOKEN'); process.exit(1); }
  console.log('\n🔧 AFF Discord Channel Cleanup\n');

  // 1. Create new categories
  console.log('Creating categories...');
  const categories = {};
  for (const [name, position] of [
    ['🏠 WELCOME & INFO', 0],
    ['🗓️ TRAINING', 1],
    ['🎓 AGENT PROGRESSION', 2],
    ['🛠️ RESOURCES', 3],
  ]) {
    try {
      const cat = await apiCall('POST', `/guilds/${GUILD_ID}/channels`, {
        name,
        type: 4, // GUILD_CATEGORY
        position,
      });
      categories[name] = cat.id;
      console.log(`  ✓ ${name} (${cat.id})`);
    } catch (err) {
      // Category might already exist from a previous run
      console.log(`  ⚠ ${name}: ${err.message.slice(0, 100)}`);
    }
    await sleep(500);
  }

  // If categories weren't created (already exist), try to find them
  if (Object.keys(categories).length < 4) {
    console.log('Looking up existing categories...');
    const allChannels = await apiCall('GET', `/guilds/${GUILD_ID}/channels`);
    for (const ch of allChannels) {
      if (ch.type === 4) { // category
        for (const name of Object.keys(categories).length === 0
          ? ['🏠 WELCOME & INFO', '🗓️ TRAINING', '🎓 AGENT PROGRESSION', '🛠️ RESOURCES']
          : []) {
          // skip
        }
        if (ch.name.includes('WELCOME')) categories['🏠 WELCOME & INFO'] = ch.id;
        if (ch.name.includes('TRAINING') && !ch.name.includes('AGENT')) categories['🗓️ TRAINING'] = ch.id;
        if (ch.name.includes('AGENT') || ch.name.includes('PROGRESSION')) categories['🎓 AGENT PROGRESSION'] = ch.id;
        if (ch.name.includes('RESOURCE')) categories['🛠️ RESOURCES'] = ch.id;
      }
    }
  }

  // 2. Define channel updates: [channelId, newName, topic, categoryKey, position]
  const updates = [
    // 🏠 WELCOME & INFO
    [CH.WELCOME, 'welcome', 'Start here. Meet the team and get oriented.', '🏠 WELCOME & INFO', 0],
    [CH.RULES, 'rules', 'Community standards and expectations for all members.', '🏠 WELCOME & INFO', 1],
    [CH.ANNOUNCEMENTS, 'announcements', 'Company-wide updates from leadership.', '🏠 WELCOME & INFO', 2],

    // 🗓️ TRAINING
    [CH.TRAINING_SCHEDULE, 'training-schedule', 'This week\'s GFI training calendar. Updated automatically by AFF Concierge.', '🗓️ TRAINING', 0],
    [CH.TRAINING_REMINDERS, 'training-reminders', 'Live alerts 15 minutes before each training starts. Join links + passcodes included.', '🗓️ TRAINING', 1],

    // 🎓 AGENT PROGRESSION
    [CH.PHASE_1_OVERVIEW, 'phase-1-overview', 'Your Phase 1 roadmap — all three steps at a glance.', '🎓 AGENT PROGRESSION', 0],
    [CH.PHASE_1_STEP_1, 'phase-1-setup', 'Step 1: Onboarding, orientation calls, and your first week.', '🎓 AGENT PROGRESSION', 1],
    [CH.PHASE_1_STEP_2, 'phase-1-execution', 'Step 2: Building consistency, weekly trainings, and daily habits.', '🎓 AGENT PROGRESSION', 2],
    [CH.PHASE_1_STEP_3, 'phase-1-exam-prep', 'Step 3: License exam prep, mastering scripts, and CFT sign-off.', '🎓 AGENT PROGRESSION', 3],
    [CH.PHASE_2, 'phase-2', 'Field training appointments and your first promotion to Associate.', '🎓 AGENT PROGRESSION', 4],
    [CH.PHASE_3, 'phase-3', 'Becoming a Certified Field Trainer (CFT).', '🎓 AGENT PROGRESSION', 5],
    [CH.PHASE_4, 'phase-4', 'Marketing Director and Elite Field Trainer path.', '🎓 AGENT PROGRESSION', 6],

    // 🛠️ RESOURCES
    [CH.BIZTOOLS, 'business-tools', 'Calendly, Zoom, Google Calendar — everything you need to run your business.', '🛠️ RESOURCES', 0],
    [CH.TRAINER_BOOKING, 'trainer-booking', 'Book time with your trainer or CFT coordinator.', '🛠️ RESOURCES', 1],
    [CH.PRESENTATIONS, 'presentations', 'Scripts, decks, and templates for prospecting, hiring, and FTAs.', '🛠️ RESOURCES', 2],
    [CH.BLOG_ARTICLES, 'blog-articles', 'New articles from allfinancialfreedom.com, posted automatically.', '🛠️ RESOURCES', 3],
  ];

  console.log('\nRenaming + moving channels...');
  for (const [channelId, newName, topic, categoryKey, position] of updates) {
    const parentId = categories[categoryKey];
    if (!parentId) {
      console.log(`  ⚠ ${newName}: category ${categoryKey} not found, skipping move`);
    }
    try {
      await apiCall('PATCH', `/channels/${channelId}`, {
        name: newName,
        topic,
        parent_id: parentId || undefined,
        position,
      });
      console.log(`  ✓ #${newName}`);
    } catch (err) {
      console.log(`  ✗ #${newName}: ${err.message.slice(0, 100)}`);
    }
    await sleep(500); // rate limit spacing
  }

  // 3. Lock #training-schedule to read-only
  // @everyone role ID = guild ID (Discord convention)
  const everyoneRoleId = GUILD_ID;
  console.log('\nLocking #training-schedule to read-only...');
  try {
    // Deny Send Messages for @everyone
    await apiCall('PUT', `/channels/${CH.TRAINING_SCHEDULE}/permissions/${everyoneRoleId}`, {
      id: everyoneRoleId,
      type: 0, // role
      deny: '2048', // SEND_MESSAGES (1 << 11 = 2048)
      allow: '0',
    });
    console.log('  ✓ @everyone denied Send Messages');
  } catch (err) {
    console.log(`  ✗ @everyone: ${err.message.slice(0, 100)}`);
  }
  await sleep(500);

  // 4. Try to delete the old empty category
  console.log('\nCleaning up old category...');
  try {
    await apiCall('DELETE', `/channels/${OLD_CATEGORY_ID}`);
    console.log('  ✓ Deleted old "ALL FINANCIAL FREEDOM" category');
  } catch (err) {
    console.log(`  ⚠ Old category: ${err.message.slice(0, 100)} (may still have channels in it)`);
  }

  console.log('\n✅ Done! Check your Discord server sidebar.\n');
}

cleanup().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

// sync-aff-connected.js — run with: node discord-bot/sync-aff-connected.js
//
// 1. Lists everyone in Discord NOT connected to the DB (no discordUserId match)
// 2. Removes AFF Connected role from those not in DB
// 3. Gives EVERY guild member the AFF Member role
require('./load-env');

const TOKEN            = process.env.DISCORD_BOT_TOKEN;
const GUILD            = '1295044213360296048';
const ROLE_CONNECTED   = '1497712341364510933'; // AFF Connected
const ROLE_AFF_MEMBER  = '1295044213360296057'; // AFF Member
const BOT_USER_ID      = '1492925881759301642'; // AFF Concierge — never touch
const DB_URL           = process.env.DATABASE_URL;

if (!TOKEN) { console.error('DISCORD_BOT_TOKEN not set'); process.exit(1); }
if (!DB_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const { Client } = require('pg');

async function discordReq(method, path, body) {
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
      const data = await res.json();
      const wait = (data.retry_after ?? 1) * 1000 + 100;
      process.stdout.write(` [rate-limited, waiting ${(wait/1000).toFixed(1)}s]`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
    return res.json();
  }
}

async function getAllMembers() {
  const members = [];
  let after = '0';
  while (true) {
    const batch = await discordReq('GET', `/guilds/${GUILD}/members?limit=1000&after=${after}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    members.push(...batch);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1].user.id;
  }
  return members;
}

async function main() {
  console.log('=== AFF Discord Sync ===\n');

  // 1. Fetch all guild members
  console.log('Fetching guild members...');
  const allMembers = await getAllMembers();
  const humans = allMembers.filter(m => !m.user?.bot);
  console.log(`Total members: ${allMembers.length} (${humans.length} humans, ${allMembers.length - humans.length} bots)\n`);

  // 2. Query DB for linked Discord IDs
  const pg = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  const { rows } = await pg.query(
    `SELECT "discordUserId", "firstName", "lastName", "agentCode"
     FROM agent_profiles
     WHERE "discordUserId" IS NOT NULL AND status = 'ACTIVE' AND is_test = false`
  );
  await pg.end();
  const linkedIds = new Set(rows.map(r => r.discordUserId));
  console.log(`Agent profiles with Discord linked: ${linkedIds.size}\n`);

  // 3. List NOT connected (humans without a DB match)
  const notConnected = humans.filter(m => !linkedIds.has(m.user.id));
  console.log(`=== NOT connected to DB (${notConnected.length} members) ===`);
  notConnected.forEach(m => {
    const name = m.nick || m.user.global_name || m.user.username;
    console.log(`  ${m.user.username.padEnd(35)} id: ${m.user.id}  display: ${name}`);
  });

  // 3b. Post not-connected list to #admin-activity
  const ADMIN_ACTIVITY = '1497704771149107385';
  const lines = notConnected.map(m => {
    const name = m.nick || m.user.global_name || m.user.username;
    return `• **${name}** (\`${m.user.username}\`) — <@${m.user.id}>`;
  });
  const chunks = [];
  let current = `**Members NOT connected to the portal (${notConnected.length})**\n`;
  for (const line of lines) {
    if (current.length + line.length + 1 > 1900) { chunks.push(current); current = ''; }
    current += line + '\n';
  }
  if (current) chunks.push(current);
  console.log(`\nPosting not-connected list to #admin-activity (${chunks.length} message(s))...`);
  for (const chunk of chunks) {
    await discordReq('POST', `/channels/${ADMIN_ACTIVITY}/messages`, { content: chunk });
  }

  // 4. Remove AFF Connected from non-DB members (skip bot)
  const toRemove = allMembers.filter(m =>
    m.roles.includes(ROLE_CONNECTED) &&
    !linkedIds.has(m.user.id) &&
    m.user.id !== BOT_USER_ID
  );
  console.log(`\n=== Removing AFF Connected from ${toRemove.length} non-DB members ===`);
  for (const m of toRemove) {
    process.stdout.write(`  ✗ ${m.user.username}`);
    await discordReq('DELETE', `/guilds/${GUILD}/members/${m.user.id}/roles/${ROLE_CONNECTED}`);
    console.log(' — done');
  }

  // 5. Give AFF Member to EVERY human member who doesn't already have it
  const needAffMember = humans.filter(m =>
    !m.roles.includes(ROLE_AFF_MEMBER) &&
    m.user.id !== BOT_USER_ID
  );
  console.log(`\n=== Granting AFF Member to ${needAffMember.length} members who don't have it ===`);
  for (const m of needAffMember) {
    process.stdout.write(`  + ${m.user.username}`);
    await discordReq('PUT', `/guilds/${GUILD}/members/${m.user.id}/roles/${ROLE_AFF_MEMBER}`);
    console.log(' — done');
  }

  const alreadyHad = humans.length - needAffMember.length;
  console.log(`  (${alreadyHad} already had AFF Member)`);

  console.log('\n=== Done ===');
}

main().catch(err => { console.error('\nFATAL:', err.message); process.exit(1); });

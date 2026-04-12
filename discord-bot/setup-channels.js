// Run once to create #blog-articles channel and webhook
// node discord-bot/setup-channels.js

require('./load-env');
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const { GUILD_ID, CHANNELS } = require('./config');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  const guild = await client.guilds.fetch(GUILD_ID);

  // Find the ALL FINANCIAL FREEDOM category (currently named EMPOWER)
  const channels = await guild.channels.fetch();
  const affCategory = channels.find(c => c.type === 4 && (c.name.toUpperCase().includes('EMPOWER') || c.name.toUpperCase().includes('ALL FINANCIAL')));

  if (!affCategory) {
    console.log('❌ Could not find EMPOWER or ALL FINANCIAL FREEDOM category');
    process.exit(1);
  }

  console.log(`✅ Found category: ${affCategory.name}`);

  // Check if blog-articles already exists
  const existing = channels.find(c => c.name === 'blog-articles');
  if (existing) {
    console.log('ℹ️  #blog-articles already exists, creating webhook...');
    const webhook = await existing.createWebhook({
      name: 'AFF Blog Publisher',
      reason: 'Auto-posts new articles from allfinancialfreedom.com',
    });
    console.log(`\n✅ Webhook created!`);
    console.log(`\n👉 DISCORD_WEBHOOK_URL=${webhook.url}`);
    console.log('\nAdd this to your GitHub repo secrets:\nSettings → Secrets → Actions → New repository secret');
    client.destroy();
    process.exit(0);
  }

  // Create the channel
  const blogChannel = await guild.channels.create({
    name: 'blog-articles',
    type: ChannelType.GuildText,
    parent: affCategory.id,
    topic: 'New articles from allfinancialfreedom.com — published every Tuesday & Friday',
  });

  console.log(`✅ Created #blog-articles`);

  // Create webhook in it
  const webhook = await blogChannel.createWebhook({
    name: 'AFF Blog Publisher',
    reason: 'Auto-posts new articles from allfinancialfreedom.com',
  });

  console.log(`\n✅ Webhook created!`);
  console.log(`\n👉 DISCORD_WEBHOOK_URL=${webhook.url}`);
  console.log('\nAdd this to your GitHub repo secrets:');
  console.log('Settings → Secrets → Actions → New repository secret');
  console.log('Name: DISCORD_WEBHOOK_URL');
  console.log(`Value: ${webhook.url}`);

  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);

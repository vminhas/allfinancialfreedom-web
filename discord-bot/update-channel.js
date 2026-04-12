// Run once to update #blog-articles channel description
// node discord-bot/update-channel.js

require('./load-env');
const { Client, GatewayIntentBits } = require('discord.js');
const { GUILD_ID } = require('./config');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  const guild = await client.guilds.fetch(GUILD_ID);
  const channels = await guild.channels.fetch();
  const blogChannel = channels.find(c => c.name === 'blog-articles');

  if (!blogChannel) {
    console.log('❌ #blog-articles not found');
    process.exit(1);
  }

  await blogChannel.edit({
    topic: '📖 New articles from allfinancialfreedom.com — wealth, insurance, retirement & financial freedom resources for your clients and team.',
  });

  console.log('✅ #blog-articles description updated');
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);

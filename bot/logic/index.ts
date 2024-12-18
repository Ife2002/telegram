import * as TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';
import { Command } from './commands';

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { redis, testRedisConnection } from '../service/config/redis.config'
import { UserRepository } from 'service/user.repository';
import axios from 'axios';

dotenv.config();

// move to types directory
interface TokenResponse {
  data: {
    id: string;
    type: string;
    attributes: {
      address: string;
      name: string;
      symbol: string;
      decimals: number;
      image_url: string;
      coingecko_coin_id: string | null;
      total_supply: string;
      price_usd: string;
      fdv_usd: string;
      total_reserve_in_usd: string;
      volume_usd: {
        h24: string;
      };
      market_cap_usd: null;
    };
    relationships: {
      top_pools: {
        data: Array<{
          id: string;
          type: string;
        }>;
      };
    };
  };
}

const token: any = process.env.TELEGRAM || "";




const bot = new TelegramBot(token, { polling: true });
console.log('Bot instance created');

const connection = new Connection(process.env.HELIUS_RPC_URL);
const command = new Command(connection);

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Add connection confirmation
bot.getMe().then(async (botInfo) => {
  console.log('Bot connected successfully:', botInfo.username);
  
  // Test Redis connection
  const isConnected = await testRedisConnection();

  if (!isConnected) {
    console.error('Failed to establish Redis connection');
    process.exit(1); // Exit if Redis connection fails
  }

}).catch((error) => {
  console.error('Failed to get bot info:', error);
});


bot.on('callback_query', async (callbackQuery: TelegramBot.CallbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  const user = callbackQuery.from.id

  console.log()

  const callbackQueryId = callbackQuery.id;
  const messageId = callbackQuery.message.message_id;

  // Extract the current message text and token address
  const currentMessage = callbackQuery.message.text;
  const tokenAddress = currentMessage.match(/<code>(.*?)<\/code>/)?.[1] || '';

  switch (data) {
    // case 'autobuy':
    // command.autobuy(bot, appUser, chatId)
    case 'buy':
    await command.buy(bot, chatId, callbackQueryId, user)
    break;
    case 'setBuyPrice':
      await command.setBuyPrice(
        bot, 
        chatId, 
        callbackQueryId, 
        user.toString(), 
        messageId,
        {
          message: currentMessage,
          tokenAddress: tokenAddress
        }
      );
    break;
  }
})



 bot.on('message', async (msg) => {
  if (!msg.text) return;
  const chatId = msg.chat.id;

  if (msg.text.length >= 32 && msg.text.length <= 44) {
    try {
      // Validate it's a real public key
      new PublicKey(msg.text);
      
      const response = await axios.get(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${msg.text}`);

      const { user, isNew, publicKey } = await UserRepository.getOrCreateUser(msg.from.id.toString(), bot, chatId);

      const solBalance = await connection.getBalance(new PublicKey(publicKey));
      
      // Access data correctly through response.data.data.attributes
      const data = response.data.data.attributes;

      const buyPriceFromConfig = await UserRepository.getBuyAmount(msg.from.id.toString())


      const message = `
<b>🪙 BUY $${data.symbol.toUpperCase()} -- (${data.name})</b>
<code>${msg.text}</code>

<b>Balance: ${solBalance} SOL</b>

<b>Price: $${data?.price_usd} -- MC: $${Number(data?.fdv_usd).toLocaleString()}</b>
`;
  
      await bot.sendMessage(chatId, message, {
          parse_mode: 'HTML',
          reply_to_message_id: msg.message_id,
          reply_markup: {
              inline_keyboard: [
                  [
                      { text: '🛒 Buy', callback_data: `buy_${msg.text}` },
                      { text: '⚡️ Buy At', callback_data: `buy_${msg.text}` }
                  ],
                  [
                    { text: `Set Buy Price - ${buyPriceFromConfig || '0'} SOL`, callback_data: `setBuyPrice` },
                ]
              ]
          }
      });
  } catch (error) {
      console.error('Error:', error);
      await bot.sendMessage(chatId, '❌ <b>Error fetching token information</b>', {
          parse_mode: 'HTML',
          reply_to_message_id: msg.message_id
      });
  }}
});



const commands = [
  { command: 'buy', description: 'Buy a token based on the contact address' },
  { command: 'start', description: 'Start or Restart Avalanche' },
];

bot.setMyCommands(commands)
  .then(() => {
    console.log('Commands have been set successfully.');
  })
  .catch((error) => {
    console.error('Error setting commands:', error.message);
  });

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const { user, isNew, publicKey } = await UserRepository.getOrCreateUser(userId.toString(), bot, chatId);

    const solBalance = await connection.getBalance(new PublicKey(publicKey));

    bot.sendMessage(chatId, 
      `Solana · 🅴
<code>${publicKey}</code>  <i>(Tap to copy)</i>\n 
Balance: ${solBalance} SOL\n


Click on the Refresh button to update your current balance.
`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💰 Buy', callback_data: 'buy' },
          { text: 'Sell', callback_data: 'buy' },
        ],
      ],
    },
    });
    });


export default bot;
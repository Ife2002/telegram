import * as TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';
import { Command } from './commands';

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { redis, testRedisConnection } from '../service/config/redis.config'
import { UserRepository } from 'service/user.repository';
import axios from 'axios';
import { AnchorProvider } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { PumpFunSDK } from 'pumpdotfun-sdk';
import { getTokenInfo } from './utils/getTokenInfo';

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

interface JupPriceData {
  id: string;
  type: 'derivedPrice' | 'buyPrice';
  price: string;
}

export interface JupPriceResponse {
  data: {
    [key: string]: JupPriceData;
  };
  timeTaken: number;
}


export interface HeliusTokenMetadata {
  data: {
  interface: 'FungibleToken';
  id: string;
  content: {
    $schema: string;
    json_uri: string;
    files: Array<Record<string, unknown>>;
    metadata: {
      description: string;
      name: string;
      symbol: string;
      token_standard: 'Fungible';
    };
    links: {
      image: string;
    };
  };
  authorities: Array<{
    address: string;
    scopes: Array<unknown>;
  }>;
  compression: {
    eligible: boolean;
    compressed: boolean;
    data_hash: string;
    creator_hash: string;
    asset_hash: string;
    tree: string;
    seq: number;
    leaf_id: number;
  };
  grouping: Array<unknown>;
  royalty: {
    royalty_model: 'creators';
    target: null;
    percent: number;
    basis_points: number;
    primary_sale_happened: boolean;
    locked: boolean;
  };
  creators: Array<unknown>;
  ownership: {
    frozen: boolean;
    delegated: boolean;
    delegate: null;
    ownership_model: 'token';
    owner: string;
  };
  supply: null;
  mutable: boolean;
  burnt: boolean;
  token_info: {
    symbol: string;
    supply: number;
    decimals: number;
    token_program: string;
    price_info: {
      price_per_token: number;
      currency: 'USDC';
    };
  };
}}

const token: any = process.env.TELEGRAM || "";




const bot = new TelegramBot(token, { polling: true });
console.log('Bot instance created');

const connection = new Connection(process.env.HELIUS_RPC_URL);
const command = new Command(connection);

let wallet = new NodeWallet(Keypair.generate());
    
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "finalized",
      });

const pumpService = new PumpFunSDK(provider)

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

  const callbackQueryId = callbackQuery.id;
  const messageId = callbackQuery.message.message_id;

  // Extract the current message text and token address
  const currentMessage = callbackQuery.message.text;
  const tokenAddress = currentMessage.match(/<code>(.*?)<\/code>/)?.[1] || '';

  if (data?.startsWith('buyNow_')) {
    // Extract the token address from the callback data
    const tokenAddress = data.split('_')[1];
    await command.buyNow(bot, chatId, callbackQueryId, connection, user, tokenAddress);
    return;
  }

  switch (data) {
    // case 'autobuy':
    // command.autobuy(bot, appUser, chatId)
    case 'buy':
    await command.buy(bot, chatId, callbackQueryId, user)
    break;
    case 'sell':
    await command.sell(bot, chatId, callbackQueryId, connection, user)
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

      const tokenInfo = await getTokenInfo(pumpService, msg?.text);

      const { publicKey } = await UserRepository.getOrCreateUserForTelegram(msg.from.id.toString(), bot, chatId);

      const solBalance = await connection.getBalance(new PublicKey(publicKey));

      const buyPriceFromConfig = await UserRepository.getBuyAmount(msg.from.id.toString())


      const message = `
      <b>🪙 BUY ${tokenInfo.symbol.toLocaleUpperCase()} -- (${tokenInfo.name})</b>
<code>${msg.text}</code>

<b>Balance: ${solBalance / LAMPORTS_PER_SOL} SOL</b>

<b>Price: $${tokenInfo.price} -- MC: $${tokenInfo.mCap.toFixed(2)}</b>      
      `;
  
      await bot.sendMessage(chatId, message, {
          parse_mode: 'HTML',
          reply_to_message_id: msg.message_id,
          reply_markup: {
              inline_keyboard: [
                  [
                      { text: '🛒 Buy Now', callback_data: `buyNow_${msg.text}` },
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
  { command: 'sell', description: 'Sell a token based on the contact address' },
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

    const { user, isNew, publicKey } = await UserRepository.getOrCreateUserForTelegram(userId.toString(), bot, chatId);

    const solBalance = await connection.getBalance(new PublicKey(publicKey));

    bot.sendMessage(chatId, 
      `Solana · 🅴
<code>${publicKey}</code>  <i>(Tap to copy)</i>\n 
Balance: ${solBalance / LAMPORTS_PER_SOL} SOL\n


Click on the Refresh button to update your current balance.
`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💰 Buy', callback_data: 'buy' },
          { text: 'Sell', callback_data: 'sell' },
        ],
      ],
    },
    });
    });


export default bot;
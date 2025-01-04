import TelegramBot from "node-telegram-bot-api";
import { autobuy } from "./autobuy";
import { buy } from "./buy";
// import { UserType } from "storage/db/user.model";
import { PumpFunSDK } from "pumpdotfun-sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { VaultService } from "../../service/vault.service";
import { AnchorProvider } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { UserRepository } from "../../service/user.repository";
import { sell } from "./sell";
import axios from "axios";
import { connection } from "mongoose";
import { getTokenPrice } from "logic/utils/getPrice";

const activeTokens = new Map<number, { id: string, balance: number, tokenData: any }>();

export class Command {
    private pumpDotFunSDK: PumpFunSDK
    private vaultService: VaultService
    private userRepo: UserRepository
    
    constructor(connection: Connection) {
        
        let wallet = new NodeWallet(Keypair.generate());

        const provider = new AnchorProvider(connection, wallet, {
            commitment: "finalized",
        });

        this.pumpDotFunSDK = new PumpFunSDK(provider);
        this.vaultService = new VaultService()
        this.userRepo = new UserRepository();
    };

    private createKeyboard(chatId: number, OwnerTokensInfo: any) {
      const activeTokenData = activeTokens.get(chatId);
      const activeTokenId = activeTokenData?.id; // Get the id from the stored data
      
      const tokenButtons = OwnerTokensInfo.items.map(token => [{
          text: `${token.id === activeTokenId ? '✓ ' : ''}${token.content.metadata.name}`,
          callback_data: `select_token:${token.id}`
      }]);
  
      const sellButtons = [[
          { text: 'Sell 25%', callback_data: 'sell:25' },
          { text: 'Sell 50%', callback_data: 'sell:50' },
          { text: 'Sell 100%', callback_data: 'sell:100' }
      ]];
  
      return {
          inline_keyboard: [
              ...tokenButtons,
              sellButtons[0]
          ]
      };
  }

  async buy(bot: TelegramBot, chatId: TelegramBot.Chat["id"], callbackQueryId: TelegramBot.CallbackQuery["id"], user: number) {
      try {
        await bot.answerCallbackQuery(callbackQueryId);
      } catch (callbackError: any) {
        // If it's just an expired callback query, log and continue
        if (callbackError.response?.body?.error_code === 400 && 
            callbackError.response?.body?.description?.includes('query is too old')) {
          console.log('Callback query expired, continuing with purchase');
        } else {
          // For other callback-related errors, throw
          throw callbackError;
        }
      }
        
        // Then send your message
        await bot.sendMessage(chatId, `Enter the token address you want to buy...`);

        // const { publicKey } = await UserRepository.getOrCreateUser(user.toString(), bot, chatId);

        // const userPubkey = await appUser.wallet.address;
        // const encryptedPrivateKey = await appUser.wallet.encryptedPrivateKey

        // const userWallet = await this.vaultService.getWallet(userPubkey, encryptedPrivateKey)

        // const userWallet = Keypair.generate();

        // let buyAmountSol = 0;
        // let mint = new PublicKey(tokenAddress);

        // // potential problem. Why persist? in MongoDB? Mongo is disk based memory compare cost and latency
        // await appUser.save();

        
        // buy(userWallet, this.pumpDotFunSDK, mint, user).then((result) => {console.log(result)})
  }

  async sell(bot: TelegramBot, chatId: TelegramBot.Chat["id"], callbackQueryId: TelegramBot.CallbackQuery["id"], connection: Connection, user: number) {
    try {
      await bot.answerCallbackQuery(callbackQueryId);
  } catch (callbackError: any) {
      if (callbackError.response?.body?.error_code === 400 && 
          callbackError.response?.body?.description?.includes('query is too old')) {
          console.log('Callback query expired, continuing with purchase');
      } else {
          throw callbackError;
      }
  }

  const { walletId } = await UserRepository.findByTelegramId(user.toString());
  const getTokensByOwnerUrl = `https://narrative-server-production.up.railway.app/das/fungible/${walletId}`;
  const getTokensByOwner = await axios.get(getTokensByOwnerUrl);
  const OwnerTokensInfo = await getTokensByOwner.data;

  // Create message array first
  let messageArray = [];
  
  // Process each token sequentially
  for (const token of OwnerTokensInfo.items) {
      const balance = token.token_info.balance / Math.pow(10, token.token_info.decimals);
      const price = await getTokenPrice(token.id);
      const totalValue = balance * price;
      
      messageArray.push(`*Token*: ${token.content.metadata.name}\n\`${token.id}\`
*Balance:* ${balance.toLocaleString()} ${token.content.metadata.symbol}
*Price:* $${price}
*Total Value:* $${totalValue}`);
  }

  // Join messages with double newline
  const finalMessage = messageArray.join('\n\n');

  const sentMessage = await bot.sendMessage(chatId, finalMessage, {
      parse_mode: "Markdown",
      reply_markup: this.createKeyboard(chatId, OwnerTokensInfo)
  });

    // Set up one-time callback handler for this specific message
    const callbackHandler = async (query: TelegramBot.CallbackQuery) => {
        if (!query.message || query.message.message_id !== sentMessage.message_id) return;

        const [action, value] = query.data.split(':');
        
        if (action === 'select_token') {
          
        const token = OwnerTokensInfo.items.find(t => t.id === value);
        const balance = token.token_info.balance / Math.pow(10, token.token_info.decimals);

        activeTokens.set(chatId, {
          id: token.id,
          balance: balance,
          tokenData: token // Store full token data if needed
        });
            
            await bot.editMessageReplyMarkup(
                this.createKeyboard(chatId, OwnerTokensInfo),
                {
                    chat_id: chatId,
                    message_id: sentMessage.message_id
                }
            );
            
            await bot.answerCallbackQuery(query.id, {
                text: `Selected token: ${token.content.metadata.name}`
            });
        }
        
        if (action === 'sell') {
            const activeToken = activeTokens.get(chatId);
            if (!activeToken) {
                await bot.answerCallbackQuery(query.id, {
                    text: 'Please select a token first'
                });
                return;
            }
            const percentage = parseInt(value);
            await bot.answerCallbackQuery(query.id, {
                text: `Selling ${percentage}% of the selected token`
            });
            
            // Execute sell logic here using this.pumpDotFunSDK
            try {

                const balanceToSell = activeToken.balance * (percentage / 100);
                await sell(bot, chatId, balanceToSell, this.pumpDotFunSDK, connection, new PublicKey(activeToken.id), user)
                await bot.sendMessage(chatId, `✅ Sold  ${percentage}% of your tokens`);
            } catch (error) {
                await bot.sendMessage(chatId, `❌ Failed to place sell order: ${error.message}`);
            }
        }
    };

    // Add the callback handler
    bot.on('callback_query', callbackHandler);

    // Optional: Remove the handler after some time (e.g., 1 hour)
    setTimeout(() => {
        bot.removeListener('callback_query', callbackHandler);
    }, 3600000);
}


  async buyNow(
    bot: TelegramBot,
    chatId: TelegramBot.Chat["id"],
    callbackQueryId: TelegramBot.CallbackQuery["id"],
    connection: Connection,
    user: number,
    tokenAddress: string
  ) {
    try {
      // Answer the callback query first
      try {
        await bot.answerCallbackQuery(callbackQueryId);
      } catch (callbackError: any) {
        // If it's just an expired callback query, log and continue
        if (callbackError.response?.body?.error_code === 400 && 
            callbackError.response?.body?.description?.includes('query is too old')) {
          console.log('Callback query expired, continuing with purchase');
        } else {
          // For other callback-related errors, throw
          throw callbackError;
        }
      }
      
      // Send initial message to user
      await bot.sendMessage(chatId, `Initiating purchase of ${tokenAddress}...`);

      // const userPubkey = await appUser.wallet.address;
      // const encryptedPrivateKey = await appUser.wallet.encryptedPrivateKey

      // const userWallet = await this.vaultService.getWallet(userPubkey, encryptedPrivateKey)
      
      // mint public key
      let mint = new PublicKey(tokenAddress);
      
      // Attempt to execute buy
      const result = await buy(bot, chatId, connection, this.pumpDotFunSDK, mint, user);
      console.log(result);
      
      // Send success message to user
      await bot.sendMessage(
        chatId,
        `✅ Successfully purchased token ${tokenAddress}`
      );
  
    } catch (error) {
      // Log the error
      console.error('Buy operation failed:', error);
      
      // Send error message to user
      let errorMessage = 'Failed to complete purchase. ';
      
      // Add more specific error information if available
      if (error instanceof Error) {
        errorMessage += `Error: ${error.message}`;
      } else {
        errorMessage += 'An unexpected error occurred.';
      }
      
      // Send error message to user
      await bot.sendMessage(chatId, `❌ ${errorMessage}`);
      
      // Re-throw the error if needed for higher-level error handling
      throw error;
    }
  }


  async setBuyPrice(
        bot: TelegramBot,
        chatId: TelegramBot.Chat["id"],
        callbackQueryId: TelegramBot.CallbackQuery["id"],
        userId: string,
        messageId: number,
        messageData: {
          message: string;
          tokenAddress: string;
        }
      ) {
        try {
          try {
            await bot.answerCallbackQuery(callbackQueryId);
          } catch (callbackError: any) {
            // If it's just an expired callback query, log and continue
            if (callbackError.response?.body?.error_code === 400 && 
                callbackError.response?.body?.description?.includes('query is too old')) {
              console.log('Callback query expired, continuing with purchase');
            } else {
              // For other callback-related errors, throw
              throw callbackError;
            }
          }
          
          // Send a new message asking for amount
          const promptMsg = await bot.sendMessage(
            chatId, 
            `💰 Enter the amount you want to buy in SOL...`
          );
    
          // Create one-time message listener for the next message
          const messageHandler = async (replyMsg) => {
            try {
              // Remove the listener after we get a message
              bot.removeListener('message', messageHandler);
    
              // Delete the prompt message
              await bot.deleteMessage(chatId, promptMsg.message_id);
    
              const amount = parseFloat(replyMsg.text);
    
              if (isNaN(amount) || amount <= 0) {
                // Delete the user's reply
                await bot.deleteMessage(chatId, replyMsg.message_id);
                
                // Keep the original message but update the button
                await bot.editMessageReplyMarkup(
                  {
                    inline_keyboard: [
                      [
                        { text: '🛒 Buy', callback_data: `buy_${messageData.tokenAddress}` },
                        { text: '⚡️ Buy At', callback_data: `buy_${messageData.tokenAddress}` }
                      ],
                      [
                        { text: `Wrong Input! Set only positive number`, callback_data: 'setBuyPrice' }
                      ]
                    ]
                  },
                  {
                    chat_id: chatId,
                    message_id: messageId
                  }
                );
                return;
              }
    
              // Delete the user's reply
              await bot.deleteMessage(chatId, replyMsg.message_id);
    
              // Update user's settings with new buy amount
              await UserRepository.setUserSetting(userId, 'buyAmount', amount);
    
              // Update only the reply markup of the original message
              await bot.editMessageReplyMarkup(
                {
                  inline_keyboard: [
                    [
                      { text: '🛒 Buy', callback_data: `buy_${messageData.tokenAddress}` },
                      { text: '⚡️ Buy At', callback_data: `buy_${messageData.tokenAddress}` }
                    ],
                    [
                      { text: `Set Buy Price - ${amount} SOL`, callback_data: 'setBuyPrice' }
                    ]
                  ]
                },
                {
                  chat_id: chatId,
                  message_id: messageId
                }
              );
    
            } catch (error) {
              console.error('Error processing buy price:', error);
              // Keep original message but update button on error
              await bot.editMessageReplyMarkup(
                {
                  inline_keyboard: [
                    [
                      { text: '🛒 Buy', callback_data: `buy_${messageData.tokenAddress}` },
                      { text: '⚡️ Buy At', callback_data: `buy_${messageData.tokenAddress}` }
                    ],
                    [
                      { text: `Set Buy Price - 0 SOL`, callback_data: 'setBuyPrice' }
                    ]
                  ]
                },
                {
                  chat_id: chatId,
                  message_id: messageId
                }
              );
            }
          };
    
          // Listen for the next message in this chat
          bot.on('message', (msg) => {
            if (msg.chat.id === chatId) {
              messageHandler(msg);
            }
          });
    
        } catch (error) {
          console.error('Error in setBuyPrice:', error);
          await bot.editMessageReplyMarkup(
            {
              inline_keyboard: [
                [
                  { text: '🛒 Buy', callback_data: `buy_${messageData.tokenAddress}` },
                  { text: '⚡️ Buy At', callback_data: `buy_${messageData.tokenAddress}` }
                ],
                [
                  { text: `Set Buy Price - 0 SOL`, callback_data: 'setBuyPrice' }
                ]
              ]
            },
            {
              chat_id: chatId,
              message_id: messageId
            }
          );
        }
  }
}

    

    // async autobuy(bot: TelegramBot, appUser: UserType, chatId: TelegramBot.Chat["id"]) {
    //     bot.sendMessage(chatId, `Toggling autobuy...`);

    //     const autoBuy = !appUser.autoBuy;
    //     // potential problem. Why persist? in MongoDB? Mongo is disk based memory compare cost and latency
    //     await appUser.save();
        
    //     autobuy()
    // }

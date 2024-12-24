import TelegramBot from "node-telegram-bot-api";
import { autobuy } from "./autobuy";
import { buy } from "./buy";
// import { UserType } from "storage/db/user.model";
import { PumpFunSDK } from "pumpdotfun-sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { VaultService } from "service/vault.service";
import { AnchorProvider } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { UserRepository } from "service/user.repository";

export class Command {
    private pumpDotFunSDK: PumpFunSDK
    private vaultService: VaultService
    
    constructor(connection: Connection) {
        
        let wallet = new NodeWallet(Keypair.generate());

        const provider = new AnchorProvider(connection, wallet, {
            commitment: "finalized",
        });

        this.pumpDotFunSDK = new PumpFunSDK(provider);
        this.vaultService = new VaultService()
    };

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

  async sell(bot: TelegramBot, chatId: TelegramBot.Chat["id"], callbackQueryId: TelegramBot.CallbackQuery["id"], user: number) {
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
  }


  async buyNow(
    bot: TelegramBot,
    chatId: TelegramBot.Chat["id"],
    callbackQueryId: TelegramBot.CallbackQuery["id"],
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
      const result = await buy(bot, chatId, this.pumpDotFunSDK, mint, user);
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

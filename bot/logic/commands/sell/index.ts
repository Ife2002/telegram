import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { PumpFunSDK, TransactionResult } from "pumpdotfun-sdk";
import bs58 from 'bs58'
import { UserRepository } from "../../../service/user.repository";
import TelegramBot from "node-telegram-bot-api";
import { toBigIntPrecise } from "../../../logic/utils";
import { getSmartMint } from "../../utils/getSmartMint";
import { sell as raydiumSell } from "../../../raydium-sdk";
import { TelegramAdapter } from "../../../lib/utils";

const SLIPPAGE_BASIS_POINTS = 3000n;
// call a service

export async function sell(
  bot: TelegramBot,
  chatId: TelegramBot.Chat["id"],
  amount: number,
  sdk: PumpFunSDK,
  connection: Connection,
  mint: PublicKey,
  user: number
): Promise<any> {
  try {

    const encryptedPrivateKey = await UserRepository.getEncryptedPrivateKeyByTelegramId(user.toString());
    if (!encryptedPrivateKey) {
      throw new Error('User wallet not found');
    }

    // Instance for if this is the telegram or discord since they share the same core
    const telegramPlatform = new TelegramAdapter(bot);

    // Create keypair from encrypted private key
    const userWallet = Keypair.fromSecretKey(bs58.decode(encryptedPrivateKey));

    // Calculate buy amount in lamports
    const sellAmountBN = toBigIntPrecise(amount);


    const account = await sdk.getBondingCurveAccount(mint);
    
    const { mintInfo } = await getSmartMint(connection, mint);
    
    
    const shouldUsePump = account && !account.complete;
    
   if(shouldUsePump) {
    // Execute buy transaction
    await bot.sendMessage(chatId, "Executing Sell - (pre-bonding phase)...");
    const tx = await sdk.sell(
      telegramPlatform,
      chatId,
      userWallet,
      mint,
      sellAmountBN,
      SLIPPAGE_BASIS_POINTS,
      {
        unitLimit: 300000,
        unitPrice: 300000,
      }
    );

  } else {
    await bot.sendMessage(chatId, "Executing Sell - (post-bonding phase)...");
     return await raydiumSell(telegramPlatform, chatId, connection, mint.toBase58(), Number(sellAmountBN) , userWallet)
  }

  } catch (error) {
    // Log the error for debugging
    console.error('Sell transaction failed:', error);

    // Rethrow with more context
    if (error instanceof Error) {
      throw new Error(`Failed to execute sell: ${error.message}`);
    } else {
      throw new Error('Failed to execute sell: Unknown error occurred');
    }
  }
}
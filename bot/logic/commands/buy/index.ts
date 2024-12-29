import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { PumpFunSDK, TransactionResult } from "pumpdotfun-sdk";
import { buy as raydiumBuy } from "raydium-sdk";
import { UserService } from "service/user.service";
import bs58 from 'bs58'
import { UserRepository } from "service/user.repository";
import TelegramBot from "node-telegram-bot-api";
import { SwapResult } from "@raydium-io/raydium-sdk-v2";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token"
import { getSmartMint } from "logic/utils/getSmartMint";

const SLIPPAGE_BASIS_POINTS = 3000n;
// call a service

// fix return type
export async function buy(
  bot: TelegramBot,
  chatId: TelegramBot.Chat["id"],
  connection: Connection,
  sdk: PumpFunSDK,
  mint: PublicKey,
  user: number
): Promise<any> {
  try {
    // Get buy amount and encrypted private key
    const buyPriceFromConfig = await UserRepository.getBuyAmount(user.toString());
    if (!buyPriceFromConfig) {
      throw new Error('Buy amount not configured for user');
    }

    const encryptedPrivateKey = await UserRepository.getEncryptedPrivateKeyByTelegramId(user.toString());
    if (!encryptedPrivateKey) {
      throw new Error('User wallet not found');
    }

    // Create keypair from encrypted private key
    const userWallet = Keypair.fromSecretKey(bs58.decode(encryptedPrivateKey));

    // Calculate buy amount in lamports
    const buyAmountLamports = BigInt(buyPriceFromConfig * LAMPORTS_PER_SOL);

    const account = await sdk.getBondingCurveAccount(mint);

    const { mintInfo } = await getSmartMint(connection, mint);

    const shouldUsePump = account && !account.complete;

    // Route based on bonding completion status
    if (shouldUsePump) {
      // Pre-bonding phase - use Pump
      await bot.sendMessage(chatId, "Executing buy - (pre-bonding phase)...");
      return await sdk.buy(
        bot,
        chatId,
        userWallet,
        mint,
        buyAmountLamports,
        SLIPPAGE_BASIS_POINTS,
        {
          unitLimit: 300000,
          unitPrice: 300000,
        }
      );
    } else {
      // Post-bonding phase - use Raydium
      await bot.sendMessage(chatId, "Executing buy - (post-bonding phase)...");
      return await raydiumBuy(bot, chatId, connection, mint.toBase58(), buyPriceFromConfig * Math.pow(10, mintInfo.decimals), userWallet);
    }

  } catch (error) {
    // Log the error for debugging
    console.error('Buy transaction failed:', error);

    // Rethrow with more context
    if (error instanceof Error) {
      throw new Error(`Failed to execute buy: ${error.message}`);
    } else {
      throw new Error('Failed to execute buy: Unknown error occurred');
    }
  }
}
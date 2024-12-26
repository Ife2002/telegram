import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { PumpFunSDK, TransactionResult } from "pumpdotfun-sdk";
import { UserService } from "service/user.service";
import bs58 from 'bs58'
import { UserRepository } from "service/user.repository";
import TelegramBot from "node-telegram-bot-api";
import { toBigIntPrecise } from "logic/utils";

const SLIPPAGE_BASIS_POINTS = 3000n;
// call a service

export async function sell(
  bot: TelegramBot,
  chatId: TelegramBot.Chat["id"],
  amount: number,
  sdk: PumpFunSDK,
  mint: PublicKey,
  user: number
): Promise<TransactionResult> {
  try {

    const encryptedPrivateKey = await UserRepository.getEncryptedPrivateKeyByTelegramId(user.toString());
    if (!encryptedPrivateKey) {
      throw new Error('User wallet not found');
    }

    // Create keypair from encrypted private key
    const userWallet = Keypair.fromSecretKey(bs58.decode(encryptedPrivateKey));

    // Calculate buy amount in lamports
    const sellAmountBN = toBigIntPrecise(amount);

    // Execute buy transaction
    const tx = await sdk.sell(
      bot,
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

    return tx;

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
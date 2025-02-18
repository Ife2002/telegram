import { Connection, Keypair } from "@solana/web3.js";
import { NATIVE_MINT } from '@solana/spl-token';
import { swap } from "./swap";
import { swapWithNozomi } from "./swapNozomi";
import { side, SwapResult } from "./types";
import TelegramBot from "node-telegram-bot-api";
import { MessagePlatform } from "lib/utils";
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Sell function that executes a swap transaction.
 *
 * @param {string} side - The side of the swap (buy or sell).
 * @param {string} address - The mint of the token you want to swap to SOL.
 * @param {number} amount - The amount of tokens to sell.
 * @param {string} payer/owner - The payer address for the transaction.
 * @returns {Promise<void>} - A promise that resolves when the swap transaction is completed.
 */
export async function sell(platform: MessagePlatform, chatId: string | number, connection: Connection, mint:string, amount:number, owner:Keypair, slippage: number, nozomiEnabled: boolean): Promise<SwapResult> {
  if(nozomiEnabled) {
    return await swapWithNozomi(platform, chatId, {
      connection, 
      nozomiApiKey: process.env.NOZOMI_API,
      owner, 
      inputMint: mint, 
      outputMint: NATIVE_MINT.toBase58(), 
      amount, 
      slippage, 
      txVersion: 'V0'});
  }
    return await swap(platform, chatId, {
      connection,
      owner,
      inputMint: mint,
      outputMint: NATIVE_MINT.toBase58(),
      amount,
      slippage,
      txVersion: "V0"
    })
}

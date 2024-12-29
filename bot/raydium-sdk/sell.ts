import { Connection, Keypair } from "@solana/web3.js";
import { NATIVE_MINT } from '@solana/spl-token';
import { swap } from "./swap";
import { side, SwapResult } from "./types";
import TelegramBot from "node-telegram-bot-api";

/**
 * Sell function that executes a swap transaction.
 *
 * @param {string} side - The side of the swap (buy or sell).
 * @param {string} address - The mint of the token you want to swap to SOL.
 * @param {number} amount - The amount of tokens to sell.
 * @param {string} payer/owner - The payer address for the transaction.
 * @returns {Promise<void>} - A promise that resolves when the swap transaction is completed.
 */
export async function sell(bot: TelegramBot, chatId: TelegramBot.Chat["id"], connection: Connection, mint:string, amount:number, owner:Keypair): Promise<SwapResult> {
  return await swap(bot, chatId, {
    connection, 
    owner, 
    inputMint: mint, 
    outputMint: NATIVE_MINT.toBase58(), 
    amount, 
    slippage: 15, 
    txVersion: 'V0'});
}

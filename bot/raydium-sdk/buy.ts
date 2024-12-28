import { Connection, Keypair } from "@solana/web3.js";
import { NATIVE_MINT } from '@solana/spl-token';
import { swap } from "./swap";
import { side, SwapResult } from "./types";

/**
 * Buy function that executes a swap transaction.
 *
 * @param {string} side - The side of the swap (buy or sell).
 * @param {string} address - The mint of the token you want to swap to SOL.
 * @param {number} amount - The amount of tokens to buy.
 * @param {string} payer/owner - The payer address for the transaction.
 * @returns {Promise<void>} - A promise that resolves when the swap transaction is completed.
 */
export async function buy(connection: Connection, mint:string, amount:number, owner:Keypair): Promise<SwapResult> {
  /// account for their mint amount in their decimals
  return await swap({
    connection, 
    owner, 
    inputMint: NATIVE_MINT.toBase58(), 
    outputMint: mint, 
    amount, 
    slippage: 0.5, 
    txVersion: 'V0'});
}
import {
    Commitment,
    ComputeBudgetProgram,
    Connection,
    Finality,
    Keypair,
    PublicKey,
    SendTransactionError,
    Transaction,
    TransactionMessage,
    VersionedTransaction,
    VersionedTransactionResponse,
  } from "@solana/web3.js";
  import { PriorityFee, TransactionResult } from "./types";
import TelegramBot from "node-telegram-bot-api";
import { MessagePlatform } from "./adapter";
  
  export const DEFAULT_COMMITMENT: Commitment = "confirmed";
  export const DEFAULT_FINALITY: Finality = "confirmed";
  
  export const calculateWithSlippageBuy = (
    amount: bigint,
    basisPoints: bigint
  ) => {
    return amount + (amount * basisPoints) / 10000n;
  };
  
  export const calculateWithSlippageSell = (
    amount: bigint,
    basisPoints: bigint
  ) => {
    return amount - (amount * basisPoints) / 10000n;
  };
  
  export async function sendTx(
    platform: MessagePlatform,
    chatId: string | number,
    connection: Connection,
    tx: Transaction,
    payer: PublicKey,
    signers: Keypair[],
    priorityFees?: PriorityFee,
    commitment: Commitment = DEFAULT_COMMITMENT,
    finality: Finality = DEFAULT_FINALITY
  ): Promise<TransactionResult> {
    let newTx = new Transaction();
  
    if (priorityFees) {
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: priorityFees.unitLimit,
      });
  
      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFees.unitPrice,
      });
      newTx.add(modifyComputeUnits);
      newTx.add(addPriorityFee);
    }
  
    newTx.add(tx);
  
    let versionedTx = await buildVersionedTx(connection, payer, newTx, commitment);
    versionedTx.sign(signers);
  
    try {
      const sig = await connection.sendTransaction(versionedTx, {
        skipPreflight: false,
        maxRetries: 3
      });

      if (!sig) {
        console.error("No signature returned from transaction");
        return {
          success: false,
          error: "No signature returned from transaction",
        };
      }
    
      // Only send message if we have a valid signature
      const messageText = `Transaction sent: https://solscan.io/tx/${sig}`;
      try {
        await platform.sendMessage(chatId, messageText);
      } catch (botError) {
        console.error("Failed to send Telegram message:", botError);
        // Continue with transaction processing even if message fails
      }
  
      let txResult = await getTxDetails(connection, sig, commitment, finality);
      if (!txResult) {
        return {
          success: false,
          error: "Transaction failed",
        };
      }
      return {
        success: true,
        signature: sig,
        results: txResult,
      };
      
    } catch (e) {
      if (e instanceof SendTransactionError) {
        let ste = e as SendTransactionError;
        console.log(await ste.getLogs(connection));
      } else {
        console.error(e);
      }
      return {
        error: e,
        success: false,
      };
    }
  }
  
  export const buildVersionedTx = async (
    connection: Connection,
    payer: PublicKey,
    tx: Transaction,
    commitment: Commitment = DEFAULT_COMMITMENT
  ): Promise<VersionedTransaction> => {
    const blockHash = (await connection.getLatestBlockhash('finalized'))
      .blockhash;
  
    let messageV0 = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockHash,
      instructions: tx.instructions,
    }).compileToV0Message();
  
    return new VersionedTransaction(messageV0);
  };
  
  export const getTxDetails = async (
    connection: Connection,
    sig: string,
    commitment: Commitment = DEFAULT_COMMITMENT,
    finality: Finality = DEFAULT_FINALITY
  ): Promise<VersionedTransactionResponse | null> => {
    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction(
      {
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: sig,
      },
      commitment
    );
  
    return connection.getTransaction(sig, {
      maxSupportedTransactionVersion: 0,
      commitment: finality,
    });
  };
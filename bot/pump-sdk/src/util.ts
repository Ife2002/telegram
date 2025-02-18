import {
  AddressLookupTableAccount,
    Commitment,
    ComputeBudgetProgram,
    Connection,
    Finality,
    Keypair,
    PublicKey,
    SendTransactionError,
    Transaction,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
    VersionedTransactionResponse,
  } from "@solana/web3.js";
  import { PriorityFee, TransactionResult } from "./types";
import TelegramBot from "node-telegram-bot-api";
import { MessagePlatform } from "./adapter";
import { Helius } from "helius-sdk";
  
  export const DEFAULT_COMMITMENT: Commitment = "confirmed";
  export const DEFAULT_FINALITY: Finality = "confirmed";

  const helius = new Helius(process.env.HELIUS_RPC_URL || "");
  
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

    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
        try {
            // Get fresh blockhash for each attempt
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
            
            let txData = await buildVersionedTx(connection, payer, newTx, commitment);
            // versionedTx.sign(signers);

            const sig = await sendVersionedTxWithStakedConnection(helius, connection, txData, signers, {
              skipPreflight: true,
              maxRetries: 0,
              preflightCommitment: 'confirmed',
          });


            if (!sig) {
                throw new Error("No signature returned from transaction");
            }

            // Send notification
            const messageText = `🟡 Transaction sent ${ retryCount > 0? "again" : ""}, waiting for confirmation: https://solscan.io/tx/${sig}`;
            try {
                await platform.sendMessage(chatId, messageText);
            } catch (botError) {
                console.error("Failed to send message:", botError);
            }

            // Wait for confirmation with timeout
            const confirmation = await connection.confirmTransaction(
                {
                    blockhash,
                    lastValidBlockHeight,
                    signature: sig,
                },
                commitment
            ).then(
                result => result,
                error => {
                    if (error.toString().includes('block height exceeded')) {
                        throw new Error('Transaction expired');
                    }
                    throw error;
                }
            );

            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${confirmation.value.err}`);
            }

            let txResult = await getTxDetails(connection, sig, commitment, finality);
            if (!txResult) {
                throw new Error("Failed to get transaction details");
            }

            return {
                success: true,
                signature: sig,
                results: txResult,
            };
        } catch (error) {
            console.error(`Attempt ${retryCount + 1} failed:`, error);
            
            if (retryCount === maxRetries - 1) {
                return {
                    error,
                    success: false,
                };
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 2000));
            retryCount++;
        }
    }

    return {
        success: false,
        error: "Max retries exceeded",
    };
}

export const sendVersionedTxWithStakedConnection = async (
  helius: Helius,
  connection: Connection,
  txData: {
      versionedTx: VersionedTransaction;
      instructions: TransactionInstruction[];
      lookupTableAccounts: AddressLookupTableAccount[];
  },
  signers: Keypair[],
  options: {
      skipPreflight?: boolean;
      maxRetries?: number;
      preflightCommitment?: Commitment;
  } = {}
): Promise<string> => {
  const {
      skipPreflight = true,
      maxRetries = 0,
      preflightCommitment = 'confirmed'
  } = options;

  try {
      // Try Helius first
      return await helius.rpc.sendSmartTransaction(
          txData.instructions,
          signers,
          txData.lookupTableAccounts,
          {
              skipPreflight,
              maxRetries,
              preflightCommitment
          }
      );
  } catch (heliusError) {
      console.warn("Helius send failed, falling back to regular connection:", heliusError);
      
      // Sign the transaction if not already signed
      txData.versionedTx.sign(signers);
      
      // Fallback to regular connection
      return await connection.sendTransaction(txData.versionedTx, {
          skipPreflight,
          maxRetries,
      });
  }
};

  
export const buildVersionedTx = async (
  connection: Connection,
  payer: PublicKey,
  tx: Transaction,
  commitment: Commitment = DEFAULT_COMMITMENT
): Promise<{
  versionedTx: VersionedTransaction;
  instructions: TransactionInstruction[];
  lookupTableAccounts: AddressLookupTableAccount[];
}> => {
  const blockHash = (await connection.getLatestBlockhash('finalized')).blockhash;
  
  // Create message from instructions
  const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockHash,
      instructions: tx.instructions,
  }).compileToV0Message();

  // Create versioned transaction
  const versionedTx = new VersionedTransaction(message);

  // Get lookup tables if any exist and filter out null values
  const lookupTableAccounts = message.addressTableLookups.length > 0 
      ? (await Promise.all(
          message.addressTableLookups.map(async (lookup) => {
              const response = await connection.getAddressLookupTable(lookup.accountKey);
              return response.value;
          })
        )).filter((account): account is AddressLookupTableAccount => account !== null)
      : [];

  // Return all components needed for both regular and Helius sending
  return {
      versionedTx,
      instructions: tx.instructions,
      lookupTableAccounts
  };
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
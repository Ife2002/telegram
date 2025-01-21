import { 
    Connection, 
    Transaction, 
    PublicKey, 
    Keypair,
    TransactionMessage,
    VersionedTransaction,
    SendTransactionError,
    ComputeBudgetProgram,
    SystemProgram,
    Commitment,
    Finality, 
    LAMPORTS_PER_SOL
  } from '@solana/web3.js';
import { getTxDetails } from './util';
import { MessagePlatform } from './adapter';
  
  // Nozomi configuration
const NOZOMI_TIP_ADDRESS = new PublicKey("nozrwQtWhEdrA6W8dkbt9gnUaMs52PdAv5byipnadq3");
const DEFAULT_COMMITMENT: Commitment = "confirmed";
const DEFAULT_FINALITY: Finality = "confirmed";
  
  interface PriorityFee {
    unitLimit: number;
    unitPrice: number;
  }
  
  interface TransactionResult {
    success: boolean;
    signature?: string;
    results?: any;
    error?: any;
  }
  
  export async function sendTx(
    platform: MessagePlatform,
    chatId: string | number,
    nozomiConnection: Connection,
    mainConnection: Connection,
    tx: Transaction,
    payer: PublicKey,
    signers: Array<{publicKey: PublicKey; secretKey: Uint8Array}>,
    tipInSOL?: number,
    priorityFees?: PriorityFee,
    commitment: Commitment = DEFAULT_COMMITMENT,
    finality: Finality = DEFAULT_FINALITY
): Promise<TransactionResult> {
    let newTx = new Transaction();

    // Add compute budget instructions if priority fees are specified
    if (priorityFees) {
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: priorityFees.unitLimit,
        });
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: priorityFees.unitPrice,
        });
        newTx.add(modifyComputeUnits, addPriorityFee);
    }

    // Add main transaction instructions
    newTx.add(tx);

    const NOZOMI_TIP_LAMPORTS = tipInSOL as number * LAMPORTS_PER_SOL; // x SOL in lamports //defaultPriorityfee dynamic from redis

    // Add Nozomi tip instruction
    const nozomiTipIx = SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: NOZOMI_TIP_ADDRESS,
        lamports: NOZOMI_TIP_LAMPORTS
    });
    newTx.add(nozomiTipIx);

    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
        try {
            // Get fresh blockhash for each attempt
            const { blockhash, lastValidBlockHeight } = await mainConnection.getLatestBlockhash('finalized');
            
            // Build versioned transaction
            let messageV0 = new TransactionMessage({
                payerKey: payer,
                recentBlockhash: blockhash,
                instructions: newTx.instructions,
            }).compileToV0Message();
            
            let versionedTx = new VersionedTransaction(messageV0);
            versionedTx.sign(signers);

            // Send through Nozomi
            const timestart = Date.now();
            const sig = await nozomiConnection.sendRawTransaction(versionedTx.serialize(), {
                skipPreflight: true,
                maxRetries: 3
            });

            if (!sig) {
                throw new Error("No signature returned from transaction");
            }

            // Send notification
            const messageText = `🟡 Transaction sent${retryCount > 0 ? " again" : ""} on Fastlane!, waiting for confirmation: https://solscan.io/tx/${sig}`;
            try {
                await platform.sendMessage(chatId, messageText);
            } catch (botError) {
                console.error("Failed to send message:", botError);
            }

            // Wait for confirmation with timeout
            const confirmation = await mainConnection.confirmTransaction(
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

            console.log("Confirmed in:", (Date.now() - timestart) / 1000, "seconds");

            let txResult = await getTxDetails(mainConnection, sig, commitment, finality);
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
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            retryCount++;
        }
    }

    return {
        success: false,
        error: "Max retries exceeded",
    };
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
  
  // Helper function to create Nozomi connection
  export function createNozomiConnection(
    apiKey: string, 
    region: 'us-east' | 'ams' | 'fra' = 'us-east',
    secure: boolean = true
  ): Connection {
    const baseUrls = {
      'us-east': secure 
        ? 'https://pit1.secure.nozomi.temporal.xyz/?c=' 
        : 'http://nozomi-preview-pit.temporal.xyz/?c=',
      'ams': secure 
        ? 'https://ams1.secure.nozomi.temporal.xyz/?c=' 
        : 'http://nozomi-preview-ams.temporal.xyz/?c=',
      'fra': secure 
        ? 'https://fra1.secure.nozomi.temporal.xyz/?c=' 
        : 'http://fra1.nozomi.temporal.xyz/?c='
    };
    
    const endpoint = `${baseUrls[region]}${apiKey}`;
    return new Connection(endpoint);
  }
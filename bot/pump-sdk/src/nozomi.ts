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
    Finality
  } from '@solana/web3.js';
import { getTxDetails } from './util';
  
  // Nozomi configuration
  const NOZOMI_TIP_ADDRESS = new PublicKey("TEMPaMeCRFAS9EKF53Jd6KpHxgL47uWLcpFArU1Fanq");
  const MIN_TIP_LAMPORTS = 1_000_000; // 0.001 SOL
  const DEFAULT_COMPUTE_UNIT_PRICE = 1_000_000; // Recommended minimum CU price
  const DEFAULT_COMMITMENT = 'confirmed';
  const DEFAULT_FINALITY = 'finalized';
  
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
    connection: Connection,
    tx: Transaction,
    payer: PublicKey,
    signers: Keypair[],
    priorityFees?: PriorityFee,
    commitment: Commitment = DEFAULT_COMMITMENT,
    finality: Finality = DEFAULT_FINALITY
  ): Promise<TransactionResult> {
    let newTx = new Transaction();
    
    // Add Nozomi tip instruction first
    const tipInstruction = SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: NOZOMI_TIP_ADDRESS,
      lamports: MIN_TIP_LAMPORTS,
    });
    newTx.add(tipInstruction);
    
    // Add compute budget instructions
    const computeUnits = priorityFees?.unitLimit ?? 200_000;
    const computeUnitPrice = priorityFees?.unitPrice ?? DEFAULT_COMPUTE_UNIT_PRICE;
    
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits,
    });
    
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: computeUnitPrice,
    });
    
    newTx.add(modifyComputeUnits);
    newTx.add(addPriorityFee);
    
    // Add original transaction instructions
    newTx.add(tx);
    
    let versionedTx = await buildVersionedTx(connection, payer, newTx, commitment);
    versionedTx.sign(signers);
    
    try {
      const sig = await connection.sendTransaction(versionedTx, {
        skipPreflight: false,
        maxRetries: 3, // Add retries since Nozomi will retry on their end too
      });
      console.log("Transaction signature:", `https://solscan.io/tx/${sig}`);
      
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
    const blockHash = (await connection.getLatestBlockhash(commitment)).blockhash;
    
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
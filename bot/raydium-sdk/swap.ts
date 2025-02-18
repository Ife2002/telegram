import { Connection, Transaction, VersionedTransaction, PublicKey, Keypair, sendAndConfirmTransaction, TransactionInstruction, AddressLookupTableAccount, ComputeBudgetProgram } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { API_URLS, getATAAddress } from '@raydium-io/raydium-sdk-v2';
import axios from 'axios';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import { PriorityFeeResponse, SwapComputeResponse, SwapParams, SwapResult, SwapTransactionResponse } from './types';
import TelegramBot from 'node-telegram-bot-api';
import { MessagePlatform } from 'lib/utils';
import { UserRepository } from 'service/user.repository';
import { Helius } from 'helius-sdk';

export async function swap(platform: MessagePlatform, chatId: string | number, {
  connection,
  owner,
  inputMint,
  outputMint,
  amount,
  slippage,
  inputTokenAccount,
  outputTokenAccount,
  txVersion = 'V0'
}: SwapParams): Promise<SwapResult> {
  try {

    const helius = new Helius(process.env.HELIUS_KEY)

    // Check if input/output is SOL
    const isInputSol = inputMint === NATIVE_MINT.toBase58();
    const isOutputSol = outputMint === NATIVE_MINT.toBase58();
    const isV0Tx = txVersion === 'V0';

    // 1. Get priority fee data
    const { data: priorityFeeData } = await axios.get<PriorityFeeResponse>(
      `${API_URLS.BASE_HOST}${API_URLS.PRIORITY_FEE}`
    );

    // 2. Get quote from Raydium API
    const { data: swapResponse } = await axios.get<SwapComputeResponse>(
      `${API_URLS.SWAP_HOST}/compute/swap-base-in?` +
      `inputMint=${inputMint}&` +
      `outputMint=${outputMint}&` +
      `amount=${amount}&` +
      `slippageBps=${slippage * 100}&` +
      `txVersion=${txVersion}`
    );


    // 3. Get or create token accounts if not provided
    let inputTokenAcc = inputTokenAccount;
    let outputTokenAcc = outputTokenAccount;

    if (!inputTokenAcc && !isInputSol) {
      const { publicKey: ataAddress } = await getATAAddress(
        owner.publicKey,
        new PublicKey(inputMint)
      );
      inputTokenAcc = ataAddress;
    }

    if (!outputTokenAcc && !isOutputSol) {
      const { publicKey: ataAddress } = await getATAAddress(
        owner.publicKey,
        new PublicKey(outputMint)
      );
      outputTokenAcc = ataAddress;
    }

    // 4. Get serialized transactions from API
    const { data: swapTransactions } = await axios.post<SwapTransactionResponse>(
      `${API_URLS.SWAP_HOST}/transaction/swap-base-in`,
      {
        computeUnitPriceMicroLamports: String(priorityFeeData.data.default.h), // Using high priority
        swapResponse,
        txVersion,
        wallet: owner.publicKey.toBase58(),
        wrapSol: isInputSol,
        unwrapSol: isOutputSol,
        inputAccount: isInputSol ? undefined : inputTokenAcc?.toBase58(),
        outputAccount: isOutputSol ? undefined : outputTokenAcc?.toBase58(),
      }
    );

    // 5. Deserialize transactions
    const allTxBuf = swapTransactions.data.map((tx) => 
      Buffer.from(tx.transaction, 'base64')
    );
    
    const allTransactions = allTxBuf.map((txBuf) =>
      isV0Tx ? VersionedTransaction.deserialize(txBuf) : Transaction.from(txBuf)
    );

    // 6. Sign and send transactions
    const signatures: string[] = [];

    if (!isV0Tx) {
      // Handle legacy transactions
      for (const tx of allTransactions) {
        const transaction = tx as Transaction;
        transaction.sign(owner);
        
        const txId = await sendAndConfirmTransaction(
          connection,
          transaction,
          [owner],
          { skipPreflight: true }
        );
        
        console.log(`Transaction confirmed, txId: ${txId}`);
        platform.sendMessage(chatId, `Transaction confirmed, https://solscan.io/tx/${txId}`)
        signatures.push(txId);
      }
    } else {
      // Handle versioned transactions
      // Handle versioned transactions
      for (const tx of allTransactions) {
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            // Get latest blockhash BEFORE signing
            const { lastValidBlockHeight, blockhash } = await connection.getLatestBlockhash({
              commitment: 'finalized'
            });

            const transaction = tx as VersionedTransaction;

            const message = transaction.message;

            // First, get all lookup tables
            const lookupTableAccounts = message.addressTableLookups.length > 0 
            ? (await Promise.all(
                message.addressTableLookups.map(async (lookup) => {
                  const response = await connection.getAddressLookupTable(lookup.accountKey);
                  return response.value;
                })
              )).filter((account): account is AddressLookupTableAccount => account !== null)
            : [];

                // Resolve all account keys (including those from lookup tables)
            const accountKeys = message.getAccountKeys({
              addressLookupTableAccounts: lookupTableAccounts
            });

          // Now create instructions using the complete account keys
          let instructions = message.compiledInstructions.map((ix, index) => {

          const keys = ix.accountKeyIndexes.map(idx => {
            const pubkey = accountKeys.get(idx);
            if (!pubkey) {
              console.error(`Missing pubkey for index ${idx} in instruction ${index}`);
              throw new Error(`Invalid account index ${idx} in instruction ${index}`);
            }
            return {
              pubkey,
              isSigner: message.isAccountSigner(idx),
              isWritable: message.isAccountWritable(idx)
            };
          });

          return new TransactionInstruction({
            programId: accountKeys.get(ix.programIdIndex),
            keys,
            data: Buffer.from(ix.data)
          });
        });

        // Filter out ComputeBudgetProgram instructions
        const COMPUTE_BUDGET_ID = new PublicKey('ComputeBudget111111111111111111111111111111');
        instructions = instructions.filter(ix => !ix.programId.equals(COMPUTE_BUDGET_ID));

            // Send using Helius
            const txId = await helius.rpc.sendSmartTransaction(
              instructions,
              [owner],
              lookupTableAccounts,
              {
                skipPreflight: true,
                maxRetries: 0,
                preflightCommitment: 'confirmed'
              }
            );

            platform.sendMessage(chatId, `🟡 Transaction sent ${ retryCount > 0? "again" : ""}, waiting for confirmation: ${txId}`);

            const startTime = Date.now();
            const timeout = 30000; // 30 second timeout
            let confirmed = false;

            while (Date.now() - startTime < timeout) {
              // Use connection's getSignatureStatus instead
              const status = await connection.getSignatureStatus(txId);
              
              if (status?.value?.confirmationStatus === "confirmed") {
                confirmed = true;
                break;
              }
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (!confirmed) {
              throw new Error('Transaction confirmation timeout');
            }

            await platform.sendMessage(chatId, `Transaction confirmed, https://solscan.io/tx/${txId}`);
            signatures.push(txId);
            break; // Exit retry loop on success

          } catch (error) {
            console.error(`Attempt ${retryCount + 1} failed:`, error);
            
            if (retryCount === maxRetries - 1) {
              await platform.sendMessage(chatId, error);
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 500));
            retryCount++;
          }
        }
      }
    }

    return {
      signatures,
      inputAmount: amount,
      expectedOutputAmount: swapResponse.data.amountOut,
      priceImpact: swapResponse.data.priceImpact,
      fee: swapResponse.data.fee
    };

  } catch (error) {
    console.error('Swap failed:', error);
    throw error;
  }
}
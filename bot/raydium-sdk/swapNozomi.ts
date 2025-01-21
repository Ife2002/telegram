import { Connection, Transaction, VersionedTransaction, PublicKey, Keypair, SystemProgram, TransactionMessage, AddressLookupTableAccount } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { API_URLS, getATAAddress } from '@raydium-io/raydium-sdk-v2';
import axios from 'axios';
import { PriorityFeeResponse, SwapComputeResponse, SwapParams, SwapResult, SwapTransactionResponse } from './types';
import { MessagePlatform } from 'lib/utils';

const NOZOMI_TIP_ADDRESS = new PublicKey("nozrwQtWhEdrA6W8dkbt9gnUaMs52PdAv5byipnadq3");
const NOZOMI_TIP_LAMPORTS = 0.003 * 1000000000; // 0.003 SOL in lamports

export function createNozomiConnection(
    apiKey: string, 
    region: 'us-east' | 'ams' | 'fra' = 'ams',
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

async function loadAddressLookupTablesFromMessage(connection: Connection, message: any): Promise<AddressLookupTableAccount[]> {
    const addressLookupTableAccounts: AddressLookupTableAccount[] = [];
    for (const lookup of message.addressTableLookups) {
        const lutAccounts = await connection.getAddressLookupTable(lookup.accountKey);
        if (lutAccounts.value) {
            addressLookupTableAccounts.push(lutAccounts.value);
        }
    }
    return addressLookupTableAccounts;
}

export async function swapWithNozomi(
    platform: MessagePlatform, 
    chatId: string | number, 
    {
        connection,
        nozomiApiKey,
        owner,
        inputMint,
        outputMint,
        amount,
        slippage,
        inputTokenAccount,
        outputTokenAccount,
        txVersion = 'V0'
    }: SwapParams & { nozomiApiKey: string }
): Promise<SwapResult> {
    try {
        const nozomiConnection = createNozomiConnection(nozomiApiKey);
        const isInputSol = inputMint === NATIVE_MINT.toBase58();
        const isOutputSol = outputMint === NATIVE_MINT.toBase58();
        const isV0Tx = txVersion === 'V0';

        // Get priority fee and swap quote
        const { data: priorityFeeData } = await axios.get<PriorityFeeResponse>(
            `${API_URLS.BASE_HOST}${API_URLS.PRIORITY_FEE}`
        );

        const { data: swapResponse } = await axios.get<SwapComputeResponse>(
            `${API_URLS.SWAP_HOST}/compute/swap-base-in?` +
            `inputMint=${inputMint}&` +
            `outputMint=${outputMint}&` +
            `amount=${amount}&` +
            `slippageBps=${slippage * 100}&` +
            `txVersion=${txVersion}`
        );

        // Handle token accounts
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

        // Get swap transactions
        const { data: swapTransactions } = await axios.post<SwapTransactionResponse>(
            `${API_URLS.SWAP_HOST}/transaction/swap-base-in`,
            {
                computeUnitPriceMicroLamports: String(priorityFeeData.data.default.h),
                swapResponse,
                txVersion,
                wallet: owner.publicKey.toBase58(),
                wrapSol: isInputSol,
                unwrapSol: isOutputSol,
                inputAccount: isInputSol ? undefined : inputTokenAcc?.toBase58(),
                outputAccount: isOutputSol ? undefined : outputTokenAcc?.toBase58(),
            }
        );

        const signatures: string[] = [];

        // Process each transaction
        for (const swapTx of swapTransactions.data) {
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
                try {
                    const { lastValidBlockHeight, blockhash } = await connection.getLatestBlockhash({
                        commitment: 'finalized'
                    });

                    // Deserialize the transaction
                    const swapTransactionBuf = Buffer.from(swapTx.transaction, 'base64');
                    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

                    // Add Nozomi tip
                    const nozomiTipIx = SystemProgram.transfer({
                        fromPubkey: owner.publicKey,
                        toPubkey: NOZOMI_TIP_ADDRESS,
                        lamports: NOZOMI_TIP_LAMPORTS
                    });

                    // Decompile and recompile with the new instruction
                    const addressLookupTableAccounts = await loadAddressLookupTablesFromMessage(connection, transaction.message);
                    const txMessage = TransactionMessage.decompile(transaction.message, { addressLookupTableAccounts });
                    
                    txMessage.instructions.push(nozomiTipIx);

                    const newMessage = txMessage.compileToV0Message(addressLookupTableAccounts);
                    newMessage.recentBlockhash = blockhash;

                    const newTransaction = new VersionedTransaction(newMessage);
                    newTransaction.sign([owner]);

                    // Send through Nozomi
                    const rawTransaction = newTransaction.serialize();
                    const timestart = Date.now();
                    
                    const txid = await nozomiConnection.sendRawTransaction(rawTransaction, {
                        skipPreflight: true,
                        maxRetries: 2
                    });

                    await platform.sendMessage(chatId, 
                        `🟡 Transaction sent${retryCount > 0 ? " again" : ""} through Fastlane!, waiting for confirmation: https://solscan.io/tx/${txid}`
                    );

                    const confirmation = await connection.confirmTransaction({
                        signature: txid,
                        blockhash,
                        lastValidBlockHeight
                    });

                    if (confirmation.value.err) {
                        throw new Error(`Transaction failed: ${confirmation.value.err}`);
                    }

                    //you can pass this figure
                    console.log("Confirmed in:", (Date.now() - timestart) / 1000, "seconds");
                    // await platform.sendMessage(chatId, `Transaction confirmed: https://solscan.io/tx/${txid}`);
                    signatures.push(txid);
                    break;

                } catch (error) {
                    console.error(`Attempt ${retryCount + 1} failed:`, error);
                    
                    if (retryCount === maxRetries - 1) {
                        await platform.sendMessage(chatId, `Error: ${error.message}`);
                        throw error;
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 500));
                    retryCount++;
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
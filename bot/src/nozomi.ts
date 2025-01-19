import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AddressLookupTableAccount, Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedMessage, VersionedTransaction } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import fetch from 'cross-fetch';
import bs58 from 'bs58';

@Injectable()
export class SolanaService {
    private readonly NOZOMI_URL = 'https://ams1.secure.nozomi.temporal.xyz/';
    private readonly NOZOMI_TIP_LAMPORTS = 1000000; // 0.001 SOL
    private readonly NOZOMI_TIP_ADDRESS = new PublicKey("nozrwQtWhEdrA6W8dkbt9gnUaMs52PdAv5byipnadq3");
    
    private connection: Connection;
    private nozomiConnection: Connection;
    private wallet: Wallet;

    constructor(private readonly configService: ConfigService) {
        this.validateEnvironment();
        this.initializeConnections();
        this.initializeWallet();
    }

    private validateEnvironment(): void {
        const requiredVars = ['PRIVATE_KEY', 'NOZOMI_API'];
        const missingVars = requiredVars.filter(
            varName => !this.configService.get<string>(varName)
        );

        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }
    }

    private initializeConnections(): void {
        const rpcUrl = this.configService.get<string>('RPC_URL') || 'https://api.mainnet-beta.solana.com';
        const nozomiApi = this.configService.get<string>('NOZOMI_API');

        this.connection = new Connection(rpcUrl, "confirmed");
        this.nozomiConnection = new Connection(`${this.NOZOMI_URL}?c=${nozomiApi}`);
    }

    private initializeWallet(): void {
        const privateKeyString = this.configService.get<string>('PRIVATE_KEY');
        if (!privateKeyString) {
            throw new Error('Private key is required');
        }

        try {
            const decodedKey = bs58.decode(privateKeyString);
            if (decodedKey.length !== 64) {
                throw new Error(`Invalid private key length. Expected 64 bytes, got ${decodedKey.length}`);
            }

            const keypair = Keypair.fromSecretKey(decodedKey);
            this.wallet = new Wallet(keypair);
            console.log('Wallet initialized successfully with public key:', this.wallet.publicKey.toString());
        } catch (error) {
            throw new Error(`Failed to initialize wallet: ${error.message}`);
        }
    }

    private async loadAddressLookupTablesFromMessage(message: VersionedMessage): Promise<AddressLookupTableAccount[]> {
        const addressLookupTableAccounts: AddressLookupTableAccount[] = [];
        for (const lookup of message.addressTableLookups) {
            const lutAccounts = await this.connection.getAddressLookupTable(lookup.accountKey);
            addressLookupTableAccounts.push(lutAccounts.value!);
        }
        return addressLookupTableAccounts;
    }

    async executeSwap(): Promise<string> {
        try {
            // Get quote
            const quoteResponse = await (
                await fetch('https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112' +
                    '&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' +
                    '&amount=1000000' +
                    '&slippageBps=5000'
                )
            ).json();

            // Get swap transaction
            const { swapTransaction } = await (
                await fetch('https://quote-api.jup.ag/v6/swap', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        quoteResponse,
                        userPublicKey: this.wallet.publicKey.toString(),
                        wrapAndUnwrapSol: true,
                    })
                })
            ).json();

            // Process transaction
            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
            transaction.sign([this.wallet.payer]);

            // Add Nozomi tip
            const nozomiTipIx = SystemProgram.transfer({
                fromPubkey: this.wallet.publicKey,
                toPubkey: this.NOZOMI_TIP_ADDRESS,
                lamports: this.NOZOMI_TIP_LAMPORTS
            });

            const blockhash = await this.connection.getLatestBlockhash("finalized");
            const message = transaction.message;
            const addressLookupTableAccounts = await this.loadAddressLookupTablesFromMessage(message);
            const txMessage = TransactionMessage.decompile(message, { addressLookupTableAccounts });

            txMessage.instructions.push(nozomiTipIx);

            const newMessage = txMessage.compileToV0Message(addressLookupTableAccounts);
            newMessage.recentBlockhash = blockhash.blockhash;

            const newTransaction = new VersionedTransaction(newMessage);
            newTransaction.sign([this.wallet.payer]);

            // Execute transaction
            const rawTransaction = newTransaction.serialize();
            const timestart = Date.now();
            
            const txid = await this.nozomiConnection.sendRawTransaction(rawTransaction, {
                skipPreflight: true,
                maxRetries: 2
            });

            console.log("Nozomi response: txid: %s", txid);

            const res = await this.connection.confirmTransaction({
                signature: txid,
                blockhash: blockhash.blockhash,
                lastValidBlockHeight: blockhash.lastValidBlockHeight
            });

            console.log("Confirmed in: %s seconds", (Date.now() - timestart) / 1000);
            return txid;
        } catch (error) {
            console.error('Error executing swap:', error);
            throw error;
        }
    }
}
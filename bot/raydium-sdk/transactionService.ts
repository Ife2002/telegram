import {
    Connection,
    PublicKey,
    Transaction,
    VersionedTransaction,
    TransactionInstruction,
    AddressLookupTableAccount,
    Signer,
    ComputeBudgetProgram,
    SendOptions
  } from '@solana/web3.js';
  import { RpcClient } from 'helius-sdk';
  
  export class TransactionService {
    private connection: Connection;
    private helius: RpcClient;
  
    constructor(
      connection: Connection,
      helius: RpcClient
    ) {
      this.connection = connection;
      this.helius = helius;
    }
  
    /**
     * Process a versioned transaction with proper error handling and retries
     */
    async processTransaction(
      transaction: VersionedTransaction,
      owner: Signer,
      chatId: string | number,
      platform: any
    ): Promise<string[]> {
      const signatures: string[] = [];
      let retryCount = 0;
      const maxRetries = 3;
  
      while (retryCount < maxRetries) {
        try {
          const txId = await this.handleTransaction(transaction, owner);
          
          await platform.sendMessage(
            chatId,
            `🟡 Transaction sent ${retryCount > 0 ? "again" : ""}, waiting for confirmation: https://solscan.io/tx/${txId}`
          );
  
          // Poll for confirmation
          const confirmed = await this.pollTransactionConfirmation(txId);
          
          if (confirmed) {
            await platform.sendMessage(
              chatId,
              `✅ Transaction confirmed: https://solscan.io/tx/${txId}`
            );
            signatures.push(txId);
            break;
          } else {
            throw new Error('Transaction confirmation timeout');
          }
  
        } catch (error) {
          console.error(`Attempt ${retryCount + 1} failed:`, error);
          
          if (retryCount === maxRetries - 1) {
            await platform.sendMessage(
              chatId, 
              `❌ Error: ${error.message || 'Unknown error'}`
            );
            throw error;
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          retryCount++;
        }
      }
  
      return signatures;
    }
  
    /**
     * Handle the actual transaction sending with both Helius and fallback options
     */
    private async handleTransaction(
      transaction: VersionedTransaction,
      owner: Signer
    ): Promise<string> {
      const message = transaction.message;
      
      // Get lookup tables
      const lookupTableAccounts = await this.getLookupTables(message);
  
      // Resolve all account keys
      const accountKeys = message.getAccountKeys({
        addressLookupTableAccounts: lookupTableAccounts
      });
  
      // Create instructions while preserving original order
      const instructions = this.createInstructions(message, accountKeys);
      
      // Check if transaction already has compute budget instructions
      const hasComputeBudget = instructions.some(ix => 
        ix.programId.equals(new PublicKey('ComputeBudget111111111111111111111111111111'))
      );
  
      try {
        // If transaction already has compute budget instructions, send it as is
        if (hasComputeBudget) {
          // For transactions with existing compute budget, use regular connection
          transaction.sign([owner]);
          return await this.sendWithRegularConnection(transaction, owner);
        }
  
        // For transactions without compute budget, use Helius
        return await this.sendWithHelius(instructions, owner, lookupTableAccounts);
      } catch (error) {
        console.error('Primary send method failed:', error);
        
        // Always fall back to regular connection as last resort
        transaction.sign([owner]);
        return await this.sendWithRegularConnection(transaction, owner);
      }
    }
  
    /**
     * Get lookup tables for the transaction
     */
    private async getLookupTables(
      message: any
    ): Promise<AddressLookupTableAccount[]> {
      if (!message.addressTableLookups.length) {
        return [];
      }
  
      const lookupTables = await Promise.all(
        message.addressTableLookups.map(async (lookup: any) => {
          const response = await this.connection.getAddressLookupTable(lookup.accountKey);
          return response.value;
        })
      );
  
      return lookupTables.filter((account): account is AddressLookupTableAccount => 
        account !== null
      );
    }
  
    /**
     * Create instructions from the message
     */
    private createInstructions(
      message: any,
      accountKeys: any
    ): TransactionInstruction[] {
      return message.compiledInstructions.map((ix: any, index: number) => {
        const programId = accountKeys.get(ix.programIdIndex);
        
        // Debug logging
        console.log(`Instruction ${index}:`, {
          programId: programId.toBase58(),
          numAccounts: ix.accountKeyIndexes.length,
          dataLength: ix.data.length,
          isComputeBudget: programId.equals(
            new PublicKey('ComputeBudget111111111111111111111111111111')
          )
        });
  
        return new TransactionInstruction({
          programId,
          keys: ix.accountKeyIndexes.map((idx: number) => ({
            pubkey: accountKeys.get(idx),
            isSigner: message.isAccountSigner(idx),
            isWritable: message.isAccountWritable(idx)
          })),
          data: Buffer.from(ix.data)
        });
      });
    }
  
    /**
     * Send transaction using Helius
     */
    private async sendWithHelius(
      instructions: TransactionInstruction[],
      owner: Signer,
      lookupTableAccounts: AddressLookupTableAccount[]
    ): Promise<string> {
      return await this.helius.sendSmartTransaction(
        instructions,
        [owner],
        lookupTableAccounts,
        {
          skipPreflight: false,
          maxRetries: 3,
          preflightCommitment: 'confirmed',
          priorityFeeCap: 1000000, // 0.001 SOL max priority fee
          lastValidBlockHeightOffset: 150
        }
      );
    }
  
    /**
     * Send transaction using regular connection as fallback
     */
    private async sendWithRegularConnection(
      transaction: VersionedTransaction,
      owner: Signer
    ): Promise<string> {
      const options: SendOptions = {
        skipPreflight: true,
        maxRetries: 3,
        preflightCommitment: 'confirmed'
      };
  
      return await this.connection.sendTransaction(transaction, options);
    }
  
    /**
     * Poll for transaction confirmation
     */
    private async pollTransactionConfirmation(
      signature: string,
      timeout: number = 30000
    ): Promise<boolean> {
      const startTime = Date.now();
  
      while (Date.now() - startTime < timeout) {
        const status = await this.connection.getSignatureStatus(signature);
        
        if (status?.value?.confirmationStatus === "confirmed") {
          return true;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
  
      return false;
    }
  }
  // Usage example:
  /*
  const connection = new Connection('your-rpc-endpoint');
  const helius = new RpcClient(connection, 'your-helius-api-key');
  const transactionService = new TransactionService(connection, helius);
  
  // In your main code:
  try {
    const signatures = await transactionService.processTransaction(
      versionedTransaction,
      owner,
      chatId,
      platform
    );
    console.log('Transaction processed successfully:', signatures);
  } catch (error) {
    console.error('Failed to process transaction:', error);
  }
  */
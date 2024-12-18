import * as dotenv from 'dotenv';
import { bs58, base64 } from '@project-serum/anchor/dist/cjs/utils/bytes';
import { Keypair } from '@solana/web3.js';
import { AESEcnrypt, AESDecrypt } from '../lib';
import { Wallet } from '@project-serum/anchor';
import * as nodeVault from 'node-vault';

dotenv.config(); 

// vault service is use for interacting with anything involving signatures from the vault

interface VaultConfig {
    apiVersion?: string;
    endpoint?: string;
    token?: string;
    [key: string]: any;
  }


export class VaultService {
  private vault: nodeVault.client; // Add type definition for vault

  constructor(config: VaultConfig = {}) {
    this.vault = nodeVault({
      apiVersion: 'v1',
      endpoint: process.env.VAULT_ADDR || 'http://vault:8200',
      token: process.env.VAULT_TOKEN || '',
      ...config
    });
  }

  /**
   * Gets the vault path for a given wallet address
   * @param {string} address - Wallet address
   * @returns {string} Vault path
   */
  getWalletPath(address): string {
    return `kv/data/${address}`;
  }

  /**
   * Creates a new wallet and stores it in vault
   * @returns {Promise<{publicKey: string, encryptedPrivateKey: string}>}
   */
  async createWallet(): Promise<{publicKey: string, encryptedPrivateKey: string}> {

    try {

    const wallet = new Wallet(Keypair.generate());
    const publicKey = wallet.publicKey.toBase58();
    
    // Encrypt private key
    const { key, iv, encrypted } = AESEcnrypt(
      Buffer.from(wallet.payer.secretKey).toString('base64')
    );


    // updated write to kv V2
    await this.vault.write(
      this.getWalletPath(publicKey), 
      {
        data: {
          value: `${key}::${iv}`
        }
      }
    )

    return {
      publicKey,
      encryptedPrivateKey: encrypted,
    };

    } catch (error) {
       console.error('Failed to create wallet:', error)
      }
    
  }

  /**
   * Retrieves a wallet from vault
   * @param {string} address - Wallet address
   * @param {string} encryptedPrivateKey - Encrypted private key
   * @returns {Promise<Wallet|undefined>}
   */
  async getWallet(address, encryptedPrivateKey): Promise<Keypair|undefined> {
    try {
      const vaultData = await this.vault.read(this.getWalletPath(address));
      
      if (vaultData && vaultData.data && vaultData.data.data) {
        const [key, iv] = vaultData.data.data.value.split('::') ?? ['', ''];
        
        
        // Decrypt private key
        const decrypted = AESDecrypt(encryptedPrivateKey, key, iv);
        
        return Keypair.fromSecretKey(
            new Uint8Array(Buffer.from(decrypted, 'base64'))
          )
        ;
      }
    
      return undefined;

    } catch (error) {
      console.error('Failed to retrieve wallet:', error);
      return undefined;
    }
  }

  /**
   * Imports an existing wallet using private key
   * @param {string} privateKey - Base58 encoded private key
   * @returns {Promise<{publicKey: string, encryptedPrivateKey: string}>}
   * @throws {Error} If private key is invalid
   */
  async importWallet(privateKey): Promise<{publicKey: string, encryptedPrivateKey: string}> {
    try {
    const privateKeyBytes = new Uint8Array(bs58.decode(privateKey));
    
    if (privateKeyBytes.length !== 64) {
      throw new Error('Invalid private key!');
    }

    const wallet = new Wallet(Keypair.fromSecretKey(privateKeyBytes));
    const publicKey = wallet.publicKey.toBase58();

    // Encrypt private key
    const { key, iv, encrypted } = AESEcnrypt(
      Buffer.from(wallet.payer.secretKey).toString('base64')
    );

    // Store encryption keys in vault
    await this.vault.write(
      this.getWalletPath(publicKey),
      { value: `${key}::${iv}` }
    );

    return {
      publicKey,
      encryptedPrivateKey: encrypted,
    };
  } catch(err) {
    console.error(err)
  }
  }

  // this is a test endpoint to get all the publickeys from the vault

  async listWallets(): Promise<string[]> {
    try {
       const response = await this.vault.list('kv/metadata/')

       if (!response?.data?.keys) {
        return [];
       }

       const wallets = response.data.keys.filter(key => 
        // Add any filtering logic here if needed
        key.length > 0
       );

       return wallets;
    } catch (err) {
      console.error('Failed to list wallets:', err);
      return [];
    }
  }

  /**
   * Deletes a wallet from vault
   * @param {string} address - Wallet address
   * @returns {Promise<void>}
   */
  async deleteWallet(address) {
    try {
    await this.vault.delete(this.getWalletPath(address));
    } catch(err) {
      console.error(err)
    }
  }
}
import { AnchorProvider } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { PumpFunSDK } from 'pumpdotfun-sdk';
import fs from "fs";

const KEYS_FOLDER = __dirname + "/.keys";
const SLIPPAGE_BASIS_POINTS = 100n;

const getProvider = () => {
    if (!process.env.HELIUS_RPC_URL) {
      throw new Error("Please set HELIUS_RPC_URL in .env file");
    }
  
    const connection = new Connection(process.env.HELIUS_RPC_URL || "");
    const wallet = new NodeWallet(new Keypair());
    return new AnchorProvider(connection, wallet, { commitment: "finalized" });
};

export function getOrCreateKeypair(dir: string, keyName: string): Keypair {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const authorityKey = dir + "/" + keyName + ".json";
    if (fs.existsSync(authorityKey)) {
      const data: {
        secretKey: string;
        publicKey: string;
      } = JSON.parse(fs.readFileSync(authorityKey, "utf-8"));
      return Keypair.fromSecretKey(bs58.decode(data.secretKey));
    } else {
      const keypair = Keypair.generate();
      keypair.secretKey;
      fs.writeFileSync(
        authorityKey,
        JSON.stringify({
          secretKey: bs58.encode(keypair.secretKey),
          publicKey: keypair.publicKey.toBase58(),
        })
      );
      return keypair;
    }
  }

const provider = getProvider();
const sdk = new PumpFunSDK(provider);

const connection = provider.connection;

const testAccount = getOrCreateKeypair(KEYS_FOLDER, "test-account");
const mint = getOrCreateKeypair(KEYS_FOLDER, "mint");

const keypair = Keypair.generate();

export function autobuy() {
    // TO:DO move the helpers to separate file getProvider() getOrCreateKeypair(), ask how the private keys from the vaults are created

    sdk.buy(keypair, mint.publicKey, BigInt(0.0001 * LAMPORTS_PER_SOL), SLIPPAGE_BASIS_POINTS, {
        unitLimit: 250000,
        unitPrice: 250000,
      });
}
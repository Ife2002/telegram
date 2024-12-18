import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { PumpFunSDK, TransactionResult } from "pumpdotfun-sdk";
import { UserService } from "service/user.service";

const SLIPPAGE_BASIS_POINTS = 100n;
// call a service
export async function buy(userWallet: Keypair, sdk: PumpFunSDK, mint: PublicKey, buyAmount: number): Promise<TransactionResult> {

    //Keypair replace with getKeypairFromVault use appUser as retrieval id
  

    const tx = sdk.buy(userWallet, mint, BigInt(buyAmount * LAMPORTS_PER_SOL), SLIPPAGE_BASIS_POINTS, {
        unitLimit: 250000,
        unitPrice: 250000,
      });

    return tx;
}
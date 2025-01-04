import { AnchorProvider } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import axios from "axios";
import { PumpFunSDK } from 'pumpdotfun-sdk';

const connection = new Connection(process.env.HELIUS_RPC_URL);

let wallet = new NodeWallet(Keypair.generate());
    
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "finalized",
      });

export const pumpService = new PumpFunSDK(provider)

export async function getTokenPrice(tokenAddress: string): Promise<number> {
    const isComplete = (await pumpService.getBondingCurveAccount(new PublicKey(tokenAddress))).complete;

    if(isComplete) {
        const getSolPriceUrl = await axios.get(`https://api.jup.ag/price/v2?ids=${tokenAddress}`);
        const token: number = getSolPriceUrl.data.data[tokenAddress].price;
        return token
    } else {
        const getSolPriceUrl = await axios.get(`https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112`);
         const solPrice: number = getSolPriceUrl.data.data['So11111111111111111111111111111111111111112'].price;

        const mintInfo = await getMint(
            connection,
            new PublicKey(tokenAddress),
            "confirmed",
            TOKEN_PROGRAM_ID
        );
       
        // Get decimals from mint info
        const TOKEN_DECIMALS = mintInfo.decimals
        const SOL_DECIMALS = 9

        // One token with dynamic decimals
        const oneToken = BigInt(10 ** TOKEN_DECIMALS)

        // Fee basis points (usually 100 = 1%)
        const feeBasisPoints = 100n

        // Get sell price for one token
        const solForOneToken = (await pumpService.getBondingCurveAccount(new PublicKey(tokenAddress))).getSellPrice(oneToken, feeBasisPoints)

        // Convert from lamports to SOL accounting for decimals
        const priceInSol = Number(solForOneToken) / LAMPORTS_PER_SOL

        // If you want price formatted in dollars (assuming you have SOL price in USD)
        const priceInUSD = priceInSol * solPrice

        return Number(priceInUSD.toFixed(mintInfo?.decimals));
    }
    
    
}
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

export const getTokenPrice = async (tokenAddress: string) => {
    try {
        // First try to get bonding curve account
        const bondingCurveAccount = await pumpService.getBondingCurveAccount(new PublicKey(tokenAddress));
        
        // If no bonding curve account exists, get price directly from Jupiter
        if (!bondingCurveAccount) {
            const getSolPriceUrl = await axios.get(`https://api.jup.ag/price/v2?ids=${tokenAddress}`);
            const token: number = getSolPriceUrl.data.data[tokenAddress].price;
            return token;
        }

        // If bonding curve exists but is complete, get price from Jupiter
        if (bondingCurveAccount.complete) {
            const getSolPriceUrl = await axios.get(`https://api.jup.ag/price/v2?ids=${tokenAddress}`);
            const token: number = getSolPriceUrl.data.data[tokenAddress].price;
            return token;
        }

        // Otherwise calculate price using bonding curve
        const getSolPriceUrl = await axios.get(`https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112`);
        const solPrice: number = getSolPriceUrl.data.data['So11111111111111111111111111111111111111112'].price;

        const mintInfo = await getMint(
            connection,
            new PublicKey(tokenAddress),
            "confirmed",
            TOKEN_PROGRAM_ID
        );

        const TOKEN_DECIMALS = mintInfo.decimals;
        const oneToken = BigInt(10 ** TOKEN_DECIMALS);
        const feeBasisPoints = 100n;
        
        const solForOneToken = bondingCurveAccount.getSellPrice(oneToken, feeBasisPoints);
        const priceInSol = Number(solForOneToken) / LAMPORTS_PER_SOL;
        const priceInUSD = priceInSol * solPrice;
        
        return Number(priceInUSD.toFixed(mintInfo?.decimals));
    } catch (error) {
        console.error('Error getting token price:', error);
        throw error;
    }
}
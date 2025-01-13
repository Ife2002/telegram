import { PumpFunSDK } from "pump-sdk/src";
import { getMarketFromDexscreener } from "./dexscreener";
import { preBondingMarketInfo } from "./preBondingMarketInfo";
import { TokenMarketData } from "./types";

export async function getTokenInfo(pumpService: PumpFunSDK, tokenAddress: string): Promise<TokenMarketData> {
    try {
    // Try both requests concurrently
    const results = await Promise.allSettled([
        getMarketFromDexscreener(tokenAddress),
        preBondingMarketInfo(pumpService, tokenAddress)
    ]);

    // Check DexScreener result (index 0)
    if (results[0].status === 'fulfilled' && results[0].value) {
        return results[0].value;
    }

    // Check PreBonding result (index 1)
    if (results[1].status === 'fulfilled' && results[1].value) {
        return results[1].value;
    }

    // If both failed, combine error messages
    const errors = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(result => result.reason.message)
        .join(',');
    } catch(errors) {
        throw new Error(`Failed to fetch token info: ${errors}`);
    }
}
// https://api.dexscreener.com/latest/dex/search?q=7pADAkcs3XgSYks26ttBED8JKdLrRhihyFGnCBs2pump

import axios from "axios";
import { TokenMarketData } from "./types";

  interface DexScreenerResponse {
    schemaVersion: string;
    pairs: Pair[];
  }
  
  interface Pair {
    chainId: string;
    dexId: string;
    url: string;
    pairAddress: string;
    labels?: string[];
    baseToken: Token;
    quoteToken: Token;
    priceNative: string;
    priceUsd: string;
    txns: {
      m5: TransactionCount;
      h1: TransactionCount;
      h6: TransactionCount;
      h24: TransactionCount;
    };
    volume: {
      h24: number;
      h6: number;
      h1: number;
      m5: number;
    };
    priceChange: {
      m5: number;
      h1: number;
      h6: number;
      h24: number;
    };
    liquidity: {
      usd: number;
      base: number;
      quote: number;
    };
    fdv: number;
    marketCap: number;
    pairCreatedAt: number;
    info: {
      imageUrl: string;
      header: string;
      openGraph: string;
      websites: Website[];
      socials: Social[];
    };
    boosts: {
      active: number;
    };
  }
  
  interface Token {
    address: string;
    name: string;
    symbol: string;
  }
  
  interface TransactionCount {
    buys: number;
    sells: number;
  }
  
  interface Website {
    label: string;
    url: string;
  }
  
  interface Social {
    type: string;
    url: string;
  }

export async function getMarketFromDexscreener(tokenAddress: string): Promise<TokenMarketData> {
    try {
        // Add error handling and timeout
        const response = await axios.get<DexScreenerResponse>(
            `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
            {
                timeout: 10000, // 10 second timeout
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0' // Some APIs require a user agent
                }
            }
        );

        return {
            tokenAddress: tokenAddress,
            name: response.data?.pairs[0]?.baseToken.name,
            symbol: response.data.pairs[0].baseToken.symbol,
            solPrice: 0,
            mCap: response.data.pairs[0].marketCap,
            price: response.data.pairs[0].priceUsd,
            supply: null,
            liquidity: response.data.pairs[0].liquidity.usd
        };
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('DexScreener API Error:', {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            
            // Specific error handling
            if (error.response?.status === 500) {
                throw new Error('DexScreener API is currently unavailable. Please try again later.');
            }
            if (error.response?.status === 429) {
                throw new Error('Rate limit exceeded. Please try again in a few minutes.');
            }
        }
        throw error;
    }
}
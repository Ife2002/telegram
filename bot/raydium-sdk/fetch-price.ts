import { API_URLS } from '@raydium-io/raydium-sdk-v2';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import axios from 'axios';

interface PoolInfo {
    mintA: {
        address: string;
        decimals: number;
        symbol: string;
    };
    mintB: {
        address: string;
        decimals: number;
        symbol: string;
    };
    price: number;
    mintAmountA: number;
    mintAmountB: number;
    tvl: number;
    day: {
        volume: number;
        volumeQuote: number;
        priceMin: number;
        priceMax: number;
    };
}

async function fetchPoolInfo(mint1: string, mint2: string): Promise<PoolInfo> {
    try {
        const url = `https://api-v3.raydium.io/pools/info/mint?mint1=${mint1}&mint2=${mint2}&poolType=all&poolSortField=default&sortType=desc&pageSize=1&page=1`;
        const response = await axios.get(url);
        
        if (!response.data.success || !response.data.data.data[0]) {
            throw new Error('No pool data found');
        }
        
        return response.data.data.data[0];
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Axios Error:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
        } else {
            console.error('Error fetching pool info:', error);
        }
        throw error;
    }
}

function calculateMetrics(poolInfo: PoolInfo, totalSupply: number, solPriceUSD: number) {
    // Price is already provided by the API
    const priceInSol = poolInfo.price / LAMPORTS_PER_SOL;
    const priceInUSD = priceInSol * solPriceUSD;
    
    // Calculate market cap
    const marketCapInSol = totalSupply * priceInSol;
    const marketCapInUSD = marketCapInSol * solPriceUSD;
    
    // Liquidity is provided as TVL in USD
    const liquidityInUSD = poolInfo.tvl;
    const liquidityInSol = liquidityInUSD / solPriceUSD;
    
    return {
        tokenSymbol: poolInfo.mintB.symbol,
        priceInSol,
        priceInUSD,
        marketCapInSol,
        marketCapInUSD,
        liquidityInSol,
        liquidityInUSD,
        // Additional metrics
        solInPool: poolInfo.mintAmountA,
        tokensInPool: poolInfo.mintAmountB,
        volume24h: poolInfo.day.volume,
        priceRange24h: {
            min: poolInfo.day.priceMin,
            max: poolInfo.day.priceMax
        },
        // Decimal information
        solDecimals: poolInfo.mintA.decimals,
        tokenDecimals: poolInfo.mintB.decimals
    };
}

async function analyzePool(mint1: string, mint2: string, totalSupply: number, solPriceUSD: number = 63) {
    try {
        const poolInfo = await fetchPoolInfo(mint1, mint2);
        const analysis = calculateMetrics(poolInfo, totalSupply, solPriceUSD);
        
        return {
            ...analysis,
            priceInSol: analysis.priceInSol.toFixed(9),
            priceInUSD: analysis.priceInUSD.toFixed(6),
            marketCapInSol: analysis.marketCapInSol.toFixed(2),
            marketCapInUSD: analysis.marketCapInUSD.toFixed(2),
            liquidityInSol: analysis.liquidityInSol.toFixed(2),
            liquidityInUSD: analysis.liquidityInUSD.toFixed(2),
            volume24h: analysis.volume24h.toFixed(2)
        };
    } catch (error) {
        console.error('Error analyzing pool:', error);
        throw error;
    }
}

// Example usage:
async function main(){
  const WSOL_MINT = 'So11111111111111111111111111111111111111112';
  const TOKEN_MINT = '7pADAkcs3XgSYks26ttBED8JKdLrRhihyFGnCBs2pump';
  const TOTAL_SUPPLY = 1_000_000_000; // Replace with actual total supply
  const SOL_PRICE_USD = 185; // Replace with current SOL price

analyzePool(WSOL_MINT, TOKEN_MINT, TOTAL_SUPPLY, SOL_PRICE_USD)
    .then(analysis => {
        console.log('Pool Analysis:', analysis);
    })
    .catch(error => console.error('Error:', error));
}


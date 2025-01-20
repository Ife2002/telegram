import axios from "axios";
import { TokenMarketData } from "./types";

interface TokenData {
    timestamp: string;
    token: string;
    price_in_sol: number;
    price_in_usd: number;
    decimals: number;
    name: string;
    symbol: string;
    logoURI: string;
    marketCap: number;
    supply: number;
}

export async function getTokenInfo(tokenAddress: string): Promise<TokenMarketData> {
    try {
        const response = await axios.get<TokenData[]>(
            `https://graphql.astralane.io/api/v1/price-by-token?tokens=${tokenAddress}`,
            {
                timeout: 10000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                }
            }
        );

        // Return only the data property and take the first item if it's an array
        if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
            throw new Error('Invalid response format or no data received');
        }

        // Return the first token's data
        return {
            tokenAddress: response?.data[0].token,
            name: response?.data[0].name,
            symbol: response?.data[0].symbol,
            solPrice: response?.data[0].price_in_sol,
            price: response?.data[0].price_in_usd,
            mCap: response?.data[0].marketCap,
            imgUrl: response?.data[0].logoURI,
            supply: response?.data[0].supply,
            liquidity: null
        }

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('API Error:', {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data
            });

            if (error.response?.status === 500) {
                throw new Error('API is currently unavailable. Please try again later.');
            }
            if (error.response?.status === 429) {
                throw new Error('Rate limit exceeded. Please try again in a few minutes.');
            }
        }
        throw error;
    }
}
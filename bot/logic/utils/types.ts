export interface TokenMarketData {
    tokenAddress: string;
    name: string;
    symbol: string;
    solPrice: number;
    mCap: number;
    price: number | string;
    supply: null | number;  // Using union type since it can be null
    liquidity: number;
  }
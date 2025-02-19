interface TokenMetadata {
    name: string,
    symbol: string,
    logo_uri: string
}

export interface TokenInUserToken {
    tokenAddress: string,
    mint: string,
    balance: number,
    balance_usd: number,
    token_price: number,
    priceChange24h: number,
    decimals: number,
    metadata: TokenMetadata,
    mCap?: number
}

export interface UserTokens {
    walletAddress: string,
    totalUsd: number,
    tokens: TokenInUserToken[]
}
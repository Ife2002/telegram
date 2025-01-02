import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { PumpFunSDK } from "pump-sdk/src";
import axios from "axios";
import { HeliusTokenMetadata } from "logic";
import { TokenMarketData } from "./types";

export async function preBondingMarketInfo(pumpService: PumpFunSDK, tokenAddress: string): Promise<TokenMarketData> {
      const getSolPriceUrl = await axios.get(`https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112`);
      const solPrice: number = getSolPriceUrl.data.data['So11111111111111111111111111111111111111112'].price;


      const account = await pumpService.getBondingCurveAccount(new PublicKey(tokenAddress));

      if (!account) return null;

      const mcapInSOL = account.getMarketCapSOL();

      const mcap = ((Number(mcapInSOL)/ LAMPORTS_PER_SOL) * solPrice);

      const info: HeliusTokenMetadata = await axios.get(`https://narrative-server-production.up.railway.app/das/${tokenAddress}`);

      const tokenPrice = Number(mcapInSOL / account.tokenTotalSupply) * solPrice


      return {
        tokenAddress: tokenAddress,
        name: info.data.content.metadata.name,
        symbol: info.data.content.metadata.symbol,
        solPrice: solPrice,
        mCap: mcap,
        price: tokenPrice,
        supply: Number(account.tokenTotalSupply),
        liquidity: Number(account.realSolReserves),
      }

}
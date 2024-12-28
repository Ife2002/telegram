import { Connection, Keypair, PublicKey } from "@solana/web3.js";

// Define the transaction version type
export type TxVersion = 'LEGACY' | 'V0';

// Define interfaces for API responses
export interface PriorityFeeResponse {
  id: string;
  success: boolean;
  data: {
    default: {
      vh: number;
      h: number;
      m: number;
    }
  }
}

export interface SwapComputeResponse {
  id: string;
  success: boolean;
  data: {
    amountIn: number;
    amountOut: number;
    priceImpact: number;
    fee: number;
    routePlan: Array<{ poolId: string }>;
  }
}

export interface SwapTransactionResponse {
  id: string;
  version: string;
  success: boolean;
  data: Array<{ transaction: string }>;
}

export interface SwapParams {
  connection: Connection;
  owner: Keypair;
  inputMint: string;
  outputMint: string;
  amount: number;
  slippage: number;
  inputTokenAccount?: PublicKey;
  outputTokenAccount?: PublicKey;
  txVersion?: TxVersion;
}

export interface SwapResult {
  signatures: string[];
  inputAmount: number;
  expectedOutputAmount: number;
  priceImpact: number;
  fee: number;
}

export type side = "Buy" | "Sell";
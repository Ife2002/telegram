import axios from "axios";

// Add this interface for typing
interface RaydiumFeeResponse {
  id: string;
  success: boolean;
  data: {
    default: {
      vh: number;  // very high priority
      h: number;   // high priority
      m: number;   // medium priority
    }
  }
}

export interface PriorityFee {
    unitLimit: number;   // Compute unit limit
    unitPrice: number;   // Price per compute unit in microLamports
  }

export async function getPriorityFees(): Promise<PriorityFee> {
  try {
    const response = await axios.get<RaydiumFeeResponse>('https://api-v3.raydium.io/main/auto-fee');
    
    // Use the high priority fee from Raydium
    return {
      unitLimit: 1_400_000, // Keep compute unit limit constant
      unitPrice: response.data.data.default.h // Use Raydium's dynamic high priority fee
    };
  } catch (error) {
    console.error('Failed to fetch Raydium priority fees:', error);
    // Fallback values if API call fails
    return {
      unitLimit: 1_400_000,
      unitPrice: 600_000 // Conservative fallback
    };
  }
}
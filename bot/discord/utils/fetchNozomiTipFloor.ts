import axios from "axios";
import { NozomiTipResponse } from "../types/NozomiTipFloor";

// nozomi should have settings to enable 25, 50, 75
export async function fetchNozomiTipFloor(): Promise<number> {
    try {
      const response = await axios.get<NozomiTipResponse[]>('https://api.nozomi.temporal.xyz/tip_floor');
      if (!response.data || response.data.length === 0) {
        throw new Error('No tip floor data received from Nozomi');
      }
      return response.data[0].landed_tips_25th_percentile;
    } catch (error) {
      console.error('Error fetching Nozomi tip floor:', error);
      // You might want to provide a fallback value in case the API is unavailable
      throw new Error('Failed to fetch transaction fee from Nozomi');
    }
  }
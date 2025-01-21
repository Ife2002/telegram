// Define specific types for settings values
export interface ISettings {
  buyAmount?: number;     // Amount in SOL for token purchases
  autoBuyAmount?: number; // Amount in SOL for auto-buys
  slippage?: number;      // Slippage percentage (e.g., 1 = 1%)
  gasAdjustment?: number; // Gas adjustment multiplier
  defaultPriorityFee?: number; // New field
  buyPrices?: {          // Target buy prices for different tokens
    [tokenAddress: string]: number;
  };
  lastUpdated?: Date;     // When settings were last modified
  // Add more specific settings as needed
}

// Constants for type safety
export const DEFAULT_SETTINGS: ISettings = {
  buyAmount: 0.1,        // Default 0.1 SOL
  autoBuyAmount: 0.05,   // Default 0.05 SOL
  slippage: 5,          // Default 5%
  gasAdjustment: 1.5,   // Default 1.5x gas
  defaultPriorityFee: 0.01, // Default value in sol
  buyPrices: {},
  lastUpdated: new Date()
};

  
export interface UserType {
  discordId: string | null;
  telegramId: string | null;
  walletId: string;
  encryptedPrivateKey: string;  // Add this field
  rank: number;
  settings: ISettings;
  autoBuy: boolean;
  buddies: string[];
  blacklisted: boolean;
  buddyHash: string | null;
  dateAdded: Date;
  dateBlacklisted: Date | null;
}


// Type guard to check if a setting is valid
export function isValidSetting(key: string, value: any): boolean {
  switch (key) {
    case 'buyAmount':
    case 'autoBuyAmount':
      return typeof value === 'number' && value >= 0;
    case 'slippage':
      return typeof value === 'number' && value > 0 && value <= 100;
    case 'gasAdjustment':
      return typeof value === 'number' && value > 0;
    case 'defaultPriorityFee':
      return typeof value === 'number' && value >= 0;
    case 'buyPrices':
      return typeof value === 'object';
    default:
      return false;
  }
}
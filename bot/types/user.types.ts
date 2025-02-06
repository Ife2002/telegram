export interface ISettings {
  buyAmount: number;     
  autoBuyAmount: number;
  slippage: number;      
  gasAdjustment: number;
  defaultPriorityFee: number;
  nozomiBuyEnabled: boolean;
  buyPrices: {          
    [tokenAddress: string]: number;
  };
  lastUpdated: Date;
}

// Constants for type safety
export const DEFAULT_SETTINGS: ISettings = {
  buyAmount: 0.1,        // Default 0.1 SOL
  autoBuyAmount: 0.05,   // Default 0.05 SOL
  slippage: 5,          // Default 5%
  gasAdjustment: 1.5,   // Default 1.5x gas
  defaultPriorityFee: 0.01, // Default value in sol
  nozomiBuyEnabled: false,
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

// Types for migration configuration
export interface MigrationConfig<T = any> {
  path: string[];           // Path to the field (e.g., ['settings', 'trading', 'strategy'])
  defaultValue: T;          // Default value for new field
  transform?: (oldValue: any) => T;  // Optional transform function for existing data
  validate?: (value: T) => boolean;  // Optional validation function
  description?: string;     // Description of what the migration does
}

export interface MigrationResult {
  total: number;           // Total records processed
  updated: number;         // Number of records updated
  failed: number;          // Number of failures
  errors: Array<{         // Detailed error information
    key: string;
    error: string;
  }>;
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
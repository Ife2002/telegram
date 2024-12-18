import { Schema, model, Document } from 'mongoose';

// Interface defining the structure of a Wallet document
export interface WalletType extends Document {
  address: string;
  encryptedPrivateKey: string;
  blacklisted: boolean;
  rank: number;
  dateAdded: Date;
  dateBlacklisted: Date | null;
}

const walletSchema = new Schema<WalletType>({
  address: { 
    type: String, 
    required: true, 
    dropDups: true, 
    index: true 
  },
  encryptedPrivateKey: { 
    type: String, 
    required: true 
  },
  blacklisted: { 
    type: Boolean, 
    default: false 
  },
  // priority wallets have level 0,
  // deprioritized wallets have level 2-5 
  // (4 levels of deprioritization)
  rank: { 
    type: Number, 
    default: 1 
  },
  dateAdded: { 
    type: Date, 
    default: Date.now 
  },
  dateBlacklisted: { 
    type: Date, 
    default: null 
  }
});

walletSchema.clearIndexes();

walletSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (doc: any, ret: any) => {
    // Uncomment if you want to remove these fields from JSON output
    // delete ret._id;
    // delete ret.__v;
    return ret;
  }
});

// Create and export the model
const Wallet = model<WalletType>('Wallet', walletSchema);
export default Wallet;
import { Schema, model, Document, Types } from 'mongoose';

// Interface for the settings object
interface ISettings {
  // Add your settings properties here based on config.settings
  [key: string]: any;
}

// Interface for the User document
export interface UserType extends Document {
  discordId: string;
  telegramId: string | null;
  wallet: Types.ObjectId;
  rank: number;
  settings: ISettings;
  autoBuy: boolean;
  buddies: any[];
  blacklisted: boolean;
  buddyHash: string | null;
  dateAdded: Date;
  dateBlacklisted: Date | null;
}

// Schema definition
const schema = new Schema<UserType>({
  discordId: { 
    type: String, 
    dropDups: true, 
    index: true 
  },
  telegramId: { 
    type: String, 
    default: null 
  },
  wallet: { 
    type: Schema.Types.ObjectId, 
    ref: 'Wallet', 
    required: true 
  },
  rank: { 
    type: Number, 
    default: 1 
  },
  autoBuy: { 
    type: Boolean, 
    default: false 
  },
  blacklisted: { 
    type: Boolean, 
    default: false 
  },
  buddyHash: { 
    type: String, 
    default: null 
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

// Clear indexes and set JSON options
schema.clearIndexes();

schema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (doc: any, ret: any) => {
    // Uncomment if you want to remove these fields from JSON
    // delete ret._id;
    // delete ret.__v;
    return ret;
  }
});

// Export the model
const User = model<UserType>('User', schema);
export default User;
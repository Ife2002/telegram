import { redis } from './config/redis.config';
import { DEFAULT_SETTINGS, ISettings, UserType } from '../types/user.types';
import { Keypair } from '@solana/web3.js';
import TelegramBot from 'node-telegram-bot-api';

export class UserRepository {
  private static readonly USER_PREFIX = 'user:';
  private static readonly DISCORD_INDEX = 'discord_id_index';
  private static readonly TELEGRAM_INDEX_PREFIX  = 'telegram_id_index';
  private static readonly SETTINGS_PREFIX = 'settings:';
  private bot: TelegramBot;

  constructor(bot?: TelegramBot) {
    this.bot = bot;
  };

  private static getUserKey(id: string): string {
    return `${this.USER_PREFIX}${id}`;
  }

  private static serializeUser(user: Partial<UserType>): Record<string, string> {
    return {
        ...user,
        settings: JSON.stringify(user.settings || {}),
        buddies: JSON.stringify(user.buddies || []),
        dateAdded: user.dateAdded?.toISOString() || new Date().toISOString(),
        dateBlacklisted: user.dateBlacklisted?.toISOString() || '',
    } as unknown as Record<string, string>;
  }

  private static deserializeUser(data: Record<string, string>): UserType {
    return {
      ...data,
      settings: JSON.parse(data.settings || '{}'),
      buddies: JSON.parse(data.buddies || '[]'),
      rank: parseInt(data.rank || '1'),
      autoBuy: data.autoBuy === 'true',
      blacklisted: data.blacklisted === 'true',
      dateAdded: new Date(data.dateAdded),
      dateBlacklisted: data.dateBlacklisted ? new Date(data.dateBlacklisted) : null,
    } as UserType;
  }

  // Migration function to add default settings
  static async migrateUserSettings(userId: string): Promise<void> {
    const userKey = `${this.USER_PREFIX}${userId}`;
    const settingsKey = `${this.SETTINGS_PREFIX}${userId}`;
    
    try {
      // Get current user data
      const userData = await redis.hgetall(userKey);
      if (!userData) return;

      // Get current settings
      const currentSettings = JSON.parse(userData.settings || '{}');
      
      // Merge with default settings (keeping any existing values)
      const mergedSettings = {
        ...DEFAULT_SETTINGS,
        ...currentSettings
      };

      // Update user document with merged settings
      await redis.hset(userKey, 'settings', JSON.stringify(mergedSettings));

      // Also store in separate settings hash for faster access
      const multi = redis.multi();
      Object.entries(mergedSettings).forEach(([key, value]) => {
        multi.hset(settingsKey, key, JSON.stringify(value));
      });
      await multi.exec();

    } catch (error) {
      console.error('Error migrating user settings:', error);
      throw error;
    }
  }

  // Function to migrate all existing users
  static async migrateAllUsersSettings(): Promise<void> {
    try {
      // Get all user keys
      const userKeys = await redis.keys(`${this.USER_PREFIX}*`);
      
      // Process each user
      for (const key of userKeys) {
        const userId = key.replace(this.USER_PREFIX, '');
        await this.migrateUserSettings(userId);
      }
      
      console.log('Successfully migrated all user settings');
    } catch (error) {
      console.error('Error in migrateAllUsersSettings:', error);
      throw error;
    }
  }

  // Fast settings operations
  static async getUserSetting(userId: string, key: keyof ISettings): Promise<any> {
    const settingsKey = `${this.SETTINGS_PREFIX}${userId}`;
    const value = await redis.hget(settingsKey, key);
    return value ? JSON.parse(value) : DEFAULT_SETTINGS[key];
  }

  static async setUserSetting(userId: string, key: keyof ISettings, value: any): Promise<void> {
    const settingsKey = `${this.SETTINGS_PREFIX}${userId}`;
    await redis.hset(settingsKey, key, JSON.stringify(value));
  }

  static async getAllUserSettings(userId: string): Promise<ISettings> {
    const settingsKey = `${this.SETTINGS_PREFIX}${userId}`;
    const settings = await redis.hgetall(settingsKey);
    
    if (!settings || Object.keys(settings).length === 0) {
      return DEFAULT_SETTINGS;
    }

    return Object.entries(settings).reduce((acc, [key, value]) => {
      acc[key] = JSON.parse(value);
      return acc;
    }, {} as ISettings);
  }

  static async createUser(userData: Partial<UserType>) {
    try {
      // Generate a unique user ID
      const userId = userData.telegramId;
      
      // Create a transaction to ensure atomicity
      const multi = redis.multi();

      const settingsKey = `${this.SETTINGS_PREFIX}${userId}`;
      Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
        multi.hset(settingsKey, key, JSON.stringify(value));
      });

      // Store user data
      multi.hmset(`${this.USER_PREFIX}${userId}`, {
        ...userData,
        id: userId,
        dateAdded: userData.dateAdded.toISOString(),
        dateBlacklisted: userData.dateBlacklisted ? userData.dateBlacklisted.toISOString() : null,
        settings: JSON.stringify(DEFAULT_SETTINGS),
        buddies: JSON.stringify(userData.buddies)
      });

      // Create telegram index
      multi.hset(this.TELEGRAM_INDEX_PREFIX, userData.telegramId, userId);

      // Execute transaction
      await multi.exec();
      return userId;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  static async findByDiscordId(discordId: string): Promise<UserType | null> {
    const id = await redis.hget(this.DISCORD_INDEX, discordId);
    if (!id) return null;

    const userData = await redis.hgetall(this.getUserKey(id));
    return userData ? this.deserializeUser(userData) : null;
  }

  static async findByTelegramId(telegramId: string) {
    try {
      // First get the user ID from the telegram index
      const userId = await redis.hget(this.TELEGRAM_INDEX_PREFIX, telegramId);
      if (!userId) return null;

      // Then get the user data
      const userData = await redis.hgetall(`${this.USER_PREFIX}${userId}`);
      return userData ? userData : null;
    } catch (error) {
      console.error('Error finding user by Telegram ID:', error);
      return null;
    }
  }
  static async getOrCreateUser(telegramId: string, bot: TelegramBot, chatId: number) {
    try {
      // Try to find existing user
      let user = await this.findByTelegramId(telegramId);
      let isNew = false;

      if (!user) {
        isNew = true;
        const userkeypair = Keypair.generate();
        
        try {
          // Create new user with Solana wallet
          const userId = await this.createUser({
            telegramId,
            discordId: '', // Empty for Telegram-only users
            walletId: userkeypair.publicKey.toBase58(),
            rank: 1,
            settings: DEFAULT_SETTINGS,
            autoBuy: false,
            buddies: [],
            blacklisted: false,
            buddyHash: null,
            dateAdded: new Date(),
            dateBlacklisted: null
          });

          user = await this.findByTelegramId(telegramId);
          
          if (!user) {
            await bot.sendMessage(chatId, '❌ Error: Failed to create your user profile. Please try again later or contact support.');
            throw new Error('Failed to create user after successful creation attempt');
          }
        } catch (error) {
          console.error('Error creating new user:', error);
          await bot.sendMessage(chatId, '❌ Error: Could not create your user profile. Our team has been notified. Please try again later.');
          throw error;
        }
      }

      return {
        user,
        isNew,
        publicKey: user.walletId
      };
    } catch (error) {
      console.error('Error in getOrCreateUser:', error);
      await bot.sendMessage(chatId, '❌ An unexpected error occurred. Please try again later or contact support if the issue persists.');
      throw error;
    }
  }

  static async updateUser(id: string, userData: Partial<UserType>): Promise<UserType | null> {
    const key = this.getUserKey(id);
    const exists = await redis.exists(key);
    if (!exists) return null;

    const serializedUser = this.serializeUser(userData);
    await redis.hmset(key, serializedUser);

    const updatedData = await redis.hgetall(key);
    return this.deserializeUser(updatedData);
  }

  static async deleteUser(id: string): Promise<boolean> {
    const key = this.getUserKey(id);
    const user = await redis.hgetall(key);
    
    if (!user) return false;

    // Remove from indexes
    if (user.discordId) {
      await redis.hdel(this.DISCORD_INDEX, user.discordId);
    }
    if (user.telegramId) {
      await redis.hdel(this.TELEGRAM_INDEX_PREFIX , user.telegramId);
    }

    // Delete user data
    await redis.del(key);
    return true;
  }

  // Additional utility methods
  static async getAllUsers(): Promise<UserType[]> {
    const keys = await redis.keys(`${this.USER_PREFIX}*`);
    const users: UserType[] = [];

    for (const key of keys) {
      const userData = await redis.hgetall(key);
      if (userData) {
        users.push(this.deserializeUser(userData));
      }
    }

    return users;
  }

  static async updateBuyAmount(userId: string, amount: number): Promise<void> {
    await this.setUserSetting(userId, 'buyAmount', amount);
  }

  static async getBuyAmount(userId: string): Promise<number> {
    return await this.getUserSetting(userId, 'buyAmount');
  }
}
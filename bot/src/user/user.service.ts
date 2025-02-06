import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserSettings } from './entities/user-settings.entity';
import { UserBuddy } from './entities/user-buddy.entity';
import { ISettings, UserType, DEFAULT_SETTINGS } from '../../types/user.types';
import { Keypair } from '@solana/web3.js';
import { v4 as uuidv4 } from 'uuid';
import bs58 from 'bs58';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSettings)
    private readonly settingsRepository: Repository<UserSettings>,
    @InjectRepository(UserBuddy)
    private readonly buddyRepository: Repository<UserBuddy>
  ) {}

  // Core User Methods
  async findByDiscordId(discordId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { discordId },
      relations: ['settings', 'buddies']
    });
  }

  async findByTelegramId(telegramId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { telegramId },
      relations: ['settings', 'buddies']
    });
  }

  async findByWalletId(walletId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { walletId },
      relations: ['settings', 'buddies']
    });
  }

  async createUserDiscord(userData: Partial<UserType>) {
    const userkeypair = Keypair.generate();
    const encryptedPrivateKey = bs58.encode(userkeypair.secretKey);
    const walletId = userkeypair.publicKey.toBase58();

    return await this.userRepository.manager.transaction(async (transactionalEntityManager) => {
      // Create user with discord_id as the primary key
      const userEntity = this.userRepository.create({
        id: userData.discordId,        // Use discord_id as primary key
        discordId: userData.discordId, // Also store it in discord_id column
        telegramId: null,
        walletId,
        encryptedPrivateKey,
        rank: 1,
        autoBuy: false,
        blacklisted: false,
        buddyHash: null,
        dateAdded: new Date(),
        dateBlacklisted: null
      });

      const user = await transactionalEntityManager.save(User, userEntity);

      const settingsEntity = this.settingsRepository.create({
        userId: userData.discordId,  // Use discord_id as foreign key
        ...DEFAULT_SETTINGS,
        lastUpdated: new Date()
      });

      const settings = await transactionalEntityManager.save(UserSettings, settingsEntity);
      user.settings = settings;
      return user;
    });
}

async createUserTelegram(userData: Partial<UserType>) {
    const userkeypair = Keypair.generate();
    const encryptedPrivateKey = bs58.encode(userkeypair.secretKey);
    const walletId = userkeypair.publicKey.toBase58();

    return await this.userRepository.manager.transaction(async (transactionalEntityManager) => {
      // Create user with telegram_id as the primary key
      const userEntity = this.userRepository.create({
        id: userData.telegramId,        // Use telegram_id as primary key
        discordId: null,
        telegramId: userData.telegramId, // Also store it in telegram_id column
        walletId,
        encryptedPrivateKey,
        rank: 1,
        autoBuy: false,
        blacklisted: false,
        buddyHash: null,
        dateAdded: new Date(),
        dateBlacklisted: null
      });

      const user = await transactionalEntityManager.save(User, userEntity);

      const settingsEntity = this.settingsRepository.create({
        userId: userData.telegramId,  // Use telegram_id as foreign key
        ...DEFAULT_SETTINGS,
        lastUpdated: new Date()
      });

      const settings = await transactionalEntityManager.save(UserSettings, settingsEntity);
      user.settings = settings;
      return user;
    });
}

  async getOrCreateUserForDiscord(discordId: string, interaction: any) {
    try {
      let user = await this.findByDiscordId(discordId);
      let isNew = false;

      if (!user) {
        isNew = true;
        user = await this.createUserDiscord({ discordId });

        if (!user) {
          throw new Error('Failed to create user after successful creation attempt');
        }
      }

      return { user, isNew, publicKey: user.walletId };
    } catch (error) {
      console.error('Error in getOrCreateUserForDiscord:', error);
      if (interaction) {
        await interaction.reply({
          content: '❌ An unexpected error occurred. Please try again later or contact support.',
          ephemeral: true
        });
      }
      throw error;
    }
  }

  async getOrCreateUserForTelegram(telegramId: string, bot: any, chatId: number) {
    try {
      let user = await this.findByTelegramId(telegramId);
      let isNew = false;

      if (!user) {
        isNew = true;
        user = await this.createUserTelegram({ telegramId });

        if (!user) {
          if (bot && chatId) {
            await bot.sendMessage(chatId, '❌ Error: Failed to create your user profile. Please try again later or contact support.');
          }
          throw new Error('Failed to create user after successful creation attempt');
        }
      }

      return { user, isNew, publicKey: user.walletId };
    } catch (error) {
      console.error('Error in getOrCreateUserForTelegram:', error);
      if (bot && chatId) {
        await bot.sendMessage(chatId, '❌ An unexpected error occurred. Please try again later or contact support.');
      }
      throw error;
    }
  }

  // Settings Methods
  async updateSettings(userId: string, newSettings: Partial<ISettings>): Promise<UserSettings> {
    const settings = await this.settingsRepository.findOneBy({ userId });
    
    if (!settings) {
      throw new Error('Settings not found for user');
    }

    Object.assign(settings, newSettings);
    settings.lastUpdated = new Date();

    return this.settingsRepository.save(settings);
  }

  async getUserSetting(userId: string, key: keyof ISettings): Promise<any> {
    const settings = await this.settingsRepository.findOneBy({ userId });
    return settings ? settings[key] : DEFAULT_SETTINGS[key];
  }

  async setUserSetting<K extends keyof Omit<ISettings, 'lastUpdated'>>(
    userId: string, 
    key: K, 
    value: ISettings[K]
): Promise<void> {
    let settings = await this.settingsRepository.findOneBy({ userId });
    
    if (!settings) {
        settings = this.settingsRepository.create({
            userId,
            ...DEFAULT_SETTINGS,
            [key]: value
        } as UserSettings);
    } else {
        (settings as any)[key] = value;  // Using type assertion here
    }
    
    settings.lastUpdated = new Date();
    await this.settingsRepository.save(settings);
}

  async getAllSettings(userId: string): Promise<ISettings> {
    const settings = await this.settingsRepository.findOneBy({ userId });
    return settings || DEFAULT_SETTINGS;
  }

  async resetSettings(userId: string): Promise<boolean> {
    const settings = await this.settingsRepository.findOneBy({ userId });
    if (!settings) return false;

    Object.assign(settings, DEFAULT_SETTINGS);
    settings.lastUpdated = new Date();
    await this.settingsRepository.save(settings);
    return true;
  }

  // Buddy Methods
  async setBuddies(userId: string, buddyIds: string[]): Promise<void> {
    await this.userRepository.manager.transaction(async (transactionalEntityManager) => {
      // Remove existing buddies
      await transactionalEntityManager
        .createQueryBuilder()
        .delete()
        .from(UserBuddy)
        .where("userId = :userId", { userId })
        .execute();

      // Add new buddies
      if (buddyIds.length > 0) {
        const buddies = buddyIds.map(buddyId => ({
          userId,
          buddyId,
          createdAt: new Date()
        }));
        await transactionalEntityManager.save(UserBuddy, buddies);
      }
    });
  }

  // User Status Methods
  async setBlacklisted(userId: string, blacklisted: boolean): Promise<User> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new Error('User not found');

    user.blacklisted = blacklisted;
    user.dateBlacklisted = blacklisted ? new Date() : null;
    return this.userRepository.save(user);
  }

  async setBuddyHash(userId: string, buddyHash: string | null): Promise<User> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new Error('User not found');

    user.buddyHash = buddyHash;
    return this.userRepository.save(user);
  }

  async setAutoBuy(userId: string, autoBuy: boolean): Promise<User> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new Error('User not found');

    user.autoBuy = autoBuy;
    return this.userRepository.save(user);
  }

  async setNozomiBuyEnabled(userId: string, enabled: boolean): Promise<void> {
    await this.setUserSetting(userId, 'nozomiBuyEnabled', enabled);
  }

  // Utility Methods
  async deleteUser(userId: string): Promise<boolean> {
    const result = await this.userRepository.delete(userId);
    return result.affected > 0;
  }

  async getAllUsers(): Promise<User[]> {
    try {
      // First check if users table exists and has any records
      const count = await this.userRepository.count();
      
      if (count === 0) {
        return []; // Return empty array if no users exist
      }
  
      // If users exist, then try to get them with relations
      return this.userRepository.find({
        relations: {
          settings: true,
          buddies: true
        }
      });
    } catch (error) {
      console.error('Error in getAllUsers:', error);
      return []; // Return empty array on error
    }
  }

  // Common Settings Methods
  async getBuyAmount(userId: string): Promise<number> {
    return this.getUserSetting(userId, 'buyAmount');
  }

  async getAutoBuyAmount(userId: string): Promise<number> {
    return this.getUserSetting(userId, 'autoBuyAmount');
  }

  async getSlippage(userId: string): Promise<number> {
    return this.getUserSetting(userId, 'slippage');
  }

  async getGasAdjustment(userId: string): Promise<number> {
    return this.getUserSetting(userId, 'gasAdjustment');
  }

  async getDefaultPriorityFee(userId: string): Promise<number> {
    return this.getUserSetting(userId, 'defaultPriorityFee');
  }

  async getBuyPrices(userId: string): Promise<Record<string, number>> {
    return this.getUserSetting(userId, 'buyPrices');
  }

  async updateBuyAmount(userId: string, amount: number): Promise<void> {
    await this.setUserSetting(userId, 'buyAmount', amount);
  }

  async updateAutoBuyAmount(userId: string, amount: number): Promise<void> {
    await this.setUserSetting(userId, 'autoBuyAmount', amount);
  }

  async updateSlippage(userId: string, slippage: number): Promise<void> {
    await this.setUserSetting(userId, 'slippage', slippage);
  }

  async updateGasAdjustment(userId: string, adjustment: number): Promise<void> {
    await this.setUserSetting(userId, 'gasAdjustment', adjustment);
  }

  async updateDefaultPriorityFee(userId: string, fee: number): Promise<void> {
    await this.setUserSetting(userId, 'defaultPriorityFee', fee);
  }

  async updateBuyPrices(userId: string, prices: Record<string, number>): Promise<void> {
    await this.setUserSetting(userId, 'buyPrices', prices);
  }

  async getNozomiBuyEnabled(userId: string): Promise<boolean> {
    return this.getUserSetting(userId, 'nozomiBuyEnabled');
  }
}
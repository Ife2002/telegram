import { Entity, Column, PrimaryColumn, OneToOne, OneToMany, CreateDateColumn, BeforeInsert } from 'typeorm';
import { UserSettings } from './user-settings.entity';
import { UserBuddy } from './user-buddy.entity';
import { v4 as uuidv4 } from 'uuid'; // Make sure to install uuid package

@Entity('users')
export class User {
  @PrimaryColumn({ name: 'id' })
  id: string;  // This will be either discord_id or telegram_id

  @Column({ name: 'discord_id', nullable: true })
  discordId: string;

  @Column({ name: 'telegram_id', nullable: true })
  telegramId: string;

  @Column({ name: 'wallet_id' })
  walletId: string;

  @Column({ name: 'encrypted_private_key' })
  encryptedPrivateKey: string;

  @Column({ default: 1 })
  rank: number;

  @Column({ name: 'auto_buy', default: false })
  autoBuy: boolean;

  @Column({ default: false })
  blacklisted: boolean;

  @Column({ name: 'buddy_hash', nullable: true })
  buddyHash: string;

  @CreateDateColumn({ name: 'date_added' })
  dateAdded: Date;

  @Column({ name: 'date_blacklisted', nullable: true })
  dateBlacklisted: Date;

  @OneToOne(() => UserSettings, settings => settings.user)
  settings: UserSettings;

  @OneToMany(() => UserBuddy, userBuddy => userBuddy.user)
  buddies: UserBuddy[];
}
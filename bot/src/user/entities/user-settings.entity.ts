import { Entity, Column, PrimaryColumn, OneToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('user_settings')
export class UserSettings {
  @PrimaryColumn('varchar', { name: 'user_id' })
  userId: string;

  @Column('decimal', { name: 'buy_amount', precision: 20, scale: 8 })
  buyAmount: number;

  @Column('decimal', { name: 'auto_buy_amount', precision: 20, scale: 8 })
  autoBuyAmount: number;

  @Column('decimal', { name: 'slippage', precision: 5, scale: 2 })
  slippage: number;

  @Column('decimal', { name: 'gas_adjustment', precision: 5, scale: 2 })
  gasAdjustment: number;

  @Column('decimal', { name: 'default_priority_fee', precision: 20, scale: 8 })
  defaultPriorityFee: number;

  @Column({ name: 'nozomi_buy_enabled', default: false })
  nozomiBuyEnabled: boolean;

  @Column('jsonb', { name: 'buy_prices', default: {} })
  buyPrices: { [tokenAddress: string]: number };

  @Column({ name: 'last_updated', type: 'timestamp' })
  lastUpdated: Date;

  @OneToOne(() => User, user => user.settings)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
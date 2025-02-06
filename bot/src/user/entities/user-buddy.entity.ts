import { Entity, Column, ManyToOne, CreateDateColumn, JoinColumn, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';


@Entity('user_buddies')
export class UserBuddy {
  @PrimaryColumn({ name: 'user_id' })
  userId: string;

  @PrimaryColumn({ name: 'buddy_id' })
  buddyId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, user => user.buddies)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'buddy_id' })
  buddy: User;
}
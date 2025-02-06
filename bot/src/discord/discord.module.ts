import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscordService } from './discord.service';
import { UserService } from '../user/user.service';
import { User } from '../user/entities/user.entity';
import { UserSettings } from '../user/entities/user-settings.entity';
import { UserBuddy } from '../user/entities/user-buddy.entity';
import { DiscordController } from './discord.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSettings, UserBuddy]),
  ],
  controllers: [DiscordController],
  providers: [DiscordService, UserService],
  exports: [DiscordService]
})
export class DiscordModule {}
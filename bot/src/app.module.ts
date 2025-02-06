import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { SolanaService } from './nozomi';
import { UserModule } from './user/user.module';
import { RedisModule } from './redis/redis.module';
import { TelegramModule } from './telegram/telegram.module';
import { UserController } from './user/user.controller';
import { DiscordModule } from './discord/discord.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    UserModule,
    RedisModule,
    TelegramModule,
    DiscordModule,
  ],
  controllers: [AppController, UserController],
  providers: [AppService, SolanaService],
  exports: [SolanaService],
})
export class AppModule {}

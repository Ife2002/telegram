import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import bot from 'logic';
import { ConfigModule } from '@nestjs/config';
import { SolanaService } from './nozomi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController],
  providers: [AppService, { provide: 'TELEGRAM_BOT', useValue: bot}, SolanaService],
  exports: ['TELEGRAM_BOT', SolanaService],
})
export class AppModule {}

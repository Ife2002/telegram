import { Module } from '@nestjs/common';
import { telegramProvider } from './telegram.provider';

@Module({
  providers: [telegramProvider],
  exports: ['TELEGRAM_BOT'] 
})
export class TelegramModule {}
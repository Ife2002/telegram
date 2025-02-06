import { Provider } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';

export const TELEGRAM_BOT = 'TELEGRAM_BOT';

export const telegramProvider: Provider = {
  provide: TELEGRAM_BOT,
  useFactory: () => {
    return new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
      polling: false  // Set to false to avoid polling conflicts
    });
  },
};
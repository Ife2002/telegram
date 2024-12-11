import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { Command } from './commands';
import { UserService } from 'service/user.service';

dotenv.config();

const token: any = process.env.TELEGRAM || "";
const bot = new TelegramBot(token, { polling: true });
const userService = new UserService();

bot.on('callback_query', async (callbackQuery: TelegramBot.CallbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const id = callbackQuery.id;

  const appUser = await userService.getUserByTelegramId(id)
//   const appUser = callbackQuery

  const command = new Command()

  switch (data) {
    case 'autobuy':
    command.autobuy(bot, appUser, chatId)
  }

})
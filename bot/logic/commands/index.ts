import TelegramBot from "node-telegram-bot-api";
import { autobuy } from "./autobuy";
import { UserType } from "storage/db/models/user";

export class Command {
    constructor() {};

    async autobuy(bot: TelegramBot, appUser: UserType, chatId: TelegramBot.Chat["id"]) {
        bot.sendMessage(chatId, `Toggling autobuy...`);

        const autoBuy = !appUser.autoBuy;
        // potential problem. Why persist? in MongoDB? Mongo is disk based memory compare cost and latency
        await appUser.save();
        
        autobuy()
    }
}
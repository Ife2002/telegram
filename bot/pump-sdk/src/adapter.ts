import { ButtonInteraction } from "discord.js";
import TelegramBot from "node-telegram-bot-api";

export interface MessagePlatform {
    sendMessage: (chatId: string | number, text: string) => Promise<any>;
    editMessage: (chatId: string | number, messageId: any, text: string) => Promise<any>;
  }
  
  // Created adapters for both Telegram and Discord
  class TelegramAdapter implements MessagePlatform {
    constructor(private bot: TelegramBot) {}
  
    async sendMessage(chatId: number | string, text: string) {
      return await this.bot.sendMessage(chatId, text);
    }
  
    async editMessage(chatId: number | string, messageId: any, text: string) {
      return await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId
      });
    }
  }
  
  class DiscordAdapter implements MessagePlatform {
    private lastMessage: string | null = null;

    constructor(private interaction: ButtonInteraction) {}

    async sendMessage(chatId: string | number, text: string) {
        this.lastMessage = text;
        if (!this.interaction.replied && !this.interaction.deferred) {
            await this.interaction.deferUpdate();
        }
        return await this.interaction.followUp({
            content: text,
            ephemeral: false
        });
    }

    async editMessage(chatId: string | number, messageId: any, text: string) {
        return await this.interaction.editReply({ content: text });
    }

    getLastMessage() {
        return this.lastMessage;
    }
}
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { TokenMarketData } from "../../logic/utils/types";
import { parseUINumber } from "../../logic/utils/numberUI";
import { TokenInUserToken } from "../types/userToken.type";

interface SellCardOptions {
    token: TokenInUserToken;
    content: string;
    solBalance: number;
    price?: number;
}

export function createSellCard({
    token,
    content,
    solBalance,
}: SellCardOptions) {

    console.log(token);
    // Create embed
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`🪙 BUY ${token?.metadata.symbol.toUpperCase()} -- (${token.metadata.name})`)
        .setDescription(`\n\n#️⃣ *CA:* \`${content}\``)
        .addFields(
            { name: 'ADDITIONAL INFORMATION', value: '\u200b', inline: true },
            { name: 'Balance', value: `${Number(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`, inline: false },
            { name: 'Price', value: `$${Number(token?.token_price).toFixed(6) || "Price not found"}`, inline: false },
            { name: 'Market Cap', value: `$${parseUINumber(Number(token?.mCap))}`, inline: false },
        )
        .setTimestamp();

    // Add thumbnail if image URL exists
    if (token.metadata.logo_uri) {
        try {
            const imageUrl = token.metadata.logo_uri;
            if (imageUrl.startsWith('http') || imageUrl.startsWith('https')) {
                embed.setThumbnail(imageUrl);
            }
        } catch (error) {
            console.error('Error setting image:', error);
        }
    }

    // Create sell buttons 
    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('sell:25')
                .setLabel('Sell 25%')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('sell:50')
                .setLabel('Sell 50%')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('sell:75')
                .setLabel('Sell 75%')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('sell:100')
                .setLabel('Sell 100%')
                .setStyle(ButtonStyle.Danger)
        );

    // Return both embed and components
    return {
        embed,
        components: [row]
    };
}
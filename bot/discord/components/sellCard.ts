import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { TokenMarketData } from "../../logic/utils/types";

interface SellCardOptions {
    tokenInfo: TokenMarketData;
    content: string;
    solBalance: number;
    price?: number;
}

export function createSellCard({
    tokenInfo,
    content,
    solBalance,
}: SellCardOptions) {
    // Create embed
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`🪙 BUY ${tokenInfo.symbol.toUpperCase()} -- (${tokenInfo.name})`)
        .setDescription(`\n\n#️⃣ *CA:* \`${content}\``)
        .addFields(
            { name: 'ADDITIONAL INFORMATION', value: '\u200b', inline: true },
            { name: 'Balance', value: `${Number(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`, inline: false },
            { name: 'Price', value: `$${Number(tokenInfo?.price).toFixed(6) || "Price not found"}`, inline: false },
            { name: 'Market Cap', value: `$${Number(tokenInfo.mCap).toFixed(2)}`, inline: false },
        )
        .setTimestamp();

    // Add thumbnail if image URL exists
    if (tokenInfo.imgUrl) {
        try {
            const imageUrl = tokenInfo.imgUrl;
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
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { TokenMarketData } from "../../logic/utils/types";
import { parseUINumber } from "../../logic/utils/numberUI";
import { UserRepository } from "../../service/user.repository";



interface LookupOptions {
    tokenInfo: TokenMarketData;
    content: string;
    solBalance: number;
    buyPriceFromConfig?: number;
}

export function createLookupComponent({
    tokenInfo,
    content,
    solBalance,
    buyPriceFromConfig
}: LookupOptions) {
    // Create embed
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`🪙 BUY ${tokenInfo.symbol.toUpperCase()} -- (${tokenInfo.name})`)
        .setDescription(`\n\n#️⃣ *CA:* \`${content}\``)
        .addFields(
            { name: 'ADDITIONAL INFORMATION', value: '\u200b', inline: true },
            { name: 'Balance', value: `${Number(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`, inline: false },
            { name: 'Price', value: `$${Number(tokenInfo?.price).toFixed(6) || "Price not found"}`, inline: false },
            { name: 'Market Cap', value: `$${parseUINumber(Number(tokenInfo.mCap))}`, inline: false },
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

    // Create action row with buttons
    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`buy1`) // delimitter is underscroe
                .setLabel('Buy 1 SOL')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`buy10`)// ten reps 0.1 sol
                .setLabel('Buy 0.1 SOL')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`buyNow_${content}`)
                .setLabel(`Buy ${buyPriceFromConfig} SOL`)
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('setBuyPrice')
                .setLabel(`Set Buy Price - ${buyPriceFromConfig} SOL`)
                .setStyle(ButtonStyle.Secondary)
        );

        const row1 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`refresh_${content}`) // delimitter is underscroe
                .setLabel('🔄 Refresh')
                .setStyle(ButtonStyle.Primary),
        );


    // Return both embed and components
    return {
        embed,
        components: [row, row1]
    };
}

export async function handleRefresh(interaction, content, tokenInfo: TokenMarketData) {
    try {
        // Defer the update to show loading state
        await interaction.deferUpdate();

        // Get fresh data
        const { publicKey } = await UserRepository.getOrCreateUserForDiscord(
            interaction.user.id,
            interaction.channelId
        );
        
        const connection = new Connection(process.env.HELIUS_RPC_URL);
        const solBalance = await connection.getBalance(new PublicKey(publicKey));
        const buyPriceFromConfig = await UserRepository.getBuyAmount(interaction.user.id);

        // Create new lookup card with fresh data
        const updatedCard = createLookupComponent({
            tokenInfo,
            content,
            solBalance,
            buyPriceFromConfig
        });

        // Update the message with new data
        await interaction.editReply({
            embeds: [updatedCard.embed],
            components: updatedCard.components
        });
    } catch (error) {
        console.error('Error refreshing data:', error);
        await interaction.editReply({
            content: '❌ Failed to refresh data. Please try again.',
            ephemeral: true
        });
    }
}
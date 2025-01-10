import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { UserType } from '../../../types/user.types';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';


const data = new SlashCommandBuilder()
    .setName('me')
    .setDescription('Information about your wallet and config setting');

async function execute(interaction: ChatInputCommandInteraction, user: UserType) {
    const message = interaction.options.getString('message');
    
    const connection = new Connection(process.env.HELIUS_RPC_URL);
    const solBalance = await connection.getBalance(new PublicKey(user.walletId));
    
    // Create the copy button
    const copyButton = new ButtonBuilder()
        .setCustomId('copy_address')
        .setLabel('Copy Address')
        .setStyle(ButtonStyle.Secondary);

    const settingButton = new ButtonBuilder()
        .setCustomId('settings')
        .setLabel('Settings')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(copyButton, settingButton);

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Your Wallet Information')
        .addFields(
            { name: 'Address', value: `\`\`\`${user.walletId}\`\`\`` },
            { name: 'Balance', value: `\`${solBalance / LAMPORTS_PER_SOL}\`` }
        )
        .setTimestamp();

    // Send the message with both copyable address and embed
    const response = await interaction.reply({
        content: `${user.walletId}`,
        embeds: [embed],
        components: [row],
        fetchReply: true
    });

    // Optional: Collector for button interaction
    const filter = i => i.customId === 'copy_address' && i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async i => {
        await i.reply({ 
            content: `Address copied: \`${user.walletId}\``, 
            ephemeral: true 
        });
    });
}

module.exports = { data, execute };


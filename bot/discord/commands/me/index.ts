import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { UserType } from '../../../types/user.types';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';


const data = new SlashCommandBuilder()
        .setName('me')
        .setDescription('Information about your wallet and config setting');

async function execute(interaction: ChatInputCommandInteraction, user: UserType) {
        const message = interaction.options.getString('message');

        const connection = new Connection(process.env.HELIUS_RPC_URL);

        const solBalance = await connection.getBalance(new PublicKey(user.walletId));

        const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Your Wallet Information')
                    .addFields(
                        { name: 'Address', value: `\`${user.walletId}\`` },
                        { name: 'Balance', value: `\`${solBalance / LAMPORTS_PER_SOL}\`` }
                    )
                    .setTimestamp();
        
        await interaction.reply({
            embeds: [embed],
            fetchReply: true
        });
    }

    module.exports = { data, execute };


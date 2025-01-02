import { 
    SlashCommandBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ActionRowBuilder,
    ComponentType,
    ChatInputCommandInteraction,
    ButtonInteraction,
    EmbedBuilder
} from 'discord.js';
import { getTokenInfo } from "../../../logic/utils/getTokenInfo"
import { PumpFunSDK } from "pumpdotfun-sdk";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { AnchorProvider } from '@coral-xyz/anchor';
import { DiscordAdapter } from '../../../lib/utils';
import bs58 from 'bs58'
import { TokenMarketData } from 'logic/utils/types';
import { UserType } from 'types/user.types';

const connection = new Connection(process.env.HELIUS_RPC_URL);
        
let wallet = new NodeWallet(Keypair.generate());
                
const provider = new AnchorProvider(connection, wallet, {
      commitment: "finalized",
      });
            

const pumpService = new PumpFunSDK(provider)


    export const data = new SlashCommandBuilder()
        .setName('token')
        .setDescription('View and buy tokens')
        .addStringOption(option =>
            option.setName('address')
                .setDescription('The token address')
                .setRequired(true));

    export async function execute(interaction: ChatInputCommandInteraction, user: UserType) {
        const tokenAddress = interaction.options.getString('address', true);

        // Create the Buy Now button
        const buyButton = new ButtonBuilder()
            .setCustomId(`buyNow_${tokenAddress}`)
            .setLabel('Buy Now')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(buyButton);

        
        const tokenInfo = await getTokenInfo(pumpService, tokenAddress)

        const embed = new EmbedBuilder()
            .setColor('#0099ff')  // You can customize the color
            .setTitle('Token Information')
            .addFields(
                { name: 'Token Address', value: `\`${tokenAddress}\`` },
                    { name: 'Token Name', value: `\`${tokenInfo.name}\`` },
                    { name: 'Token Symbol', value: `\`${tokenInfo.symbol}\`` },
                    { name: 'Market Cap', value: `${tokenInfo.mCap?.toFixed(2).toString() || '0'}` },
                    { name: 'Liquidity', value: `${tokenInfo.liquidity?.toString() || '0'}` },
                    { name: 'Token Price', value: `${tokenInfo.price?.toString() || '0'}` }
            )
            .setTimestamp();

        // Send the message with the token info and button
        const response = await interaction.reply({
            embeds: [embed],
            components: [row],
            fetchReply: true
        });

        // Create button collector
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 3_600_000 // 1 hour
        });

        collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
            // Verify that the user who clicked is the one who initiated
            if (buttonInteraction.user.id !== interaction.user.id) {
                await buttonInteraction.reply({
                    content: 'This button is not for you!',
                    ephemeral: true
                });
                return;
            }

            if (buttonInteraction.customId.startsWith('buyNow_')) {
                const tokenAddress = buttonInteraction.customId.split('_')[1];
                await handleBuyNow(buttonInteraction, tokenInfo, user);
            }
        });
    };

    export async function handleBuyNow(interaction: ButtonInteraction, tokeninfo: TokenMarketData, user: UserType) {
        try {
            // First acknowledge the button interaction
            await interaction.deferUpdate();
    
            const discordPlatform = new DiscordAdapter(interaction);
    
            const buyAmountLamports = BigInt(0.001 * LAMPORTS_PER_SOL);
            const SLIPPAGE_BASIS_POINTS = 3000n;
    
            // Send initial processing message
            await interaction.followUp({
                content: `Processing purchase for token: ${tokeninfo.name}`,
                ephemeral: true
            });
    
            try {
                await pumpService.buy(
                    discordPlatform,
                    interaction.channelId,
                    Keypair.fromSecretKey(bs58.decode(user.encryptedPrivateKey)),
                    new PublicKey(tokeninfo.tokenAddress),
                    buyAmountLamports,
                    SLIPPAGE_BASIS_POINTS,
                    {
                        unitLimit: 300000,
                        unitPrice: 300000,
                    }
                );
    
                // Get the last transaction message from the adapter, in this case it is the signature
                const txMessage = discordPlatform.getLastMessage();
                
                // Send final success message including transaction info
                await interaction.followUp({
                    content: `✅ Successfully purchased token: ${tokeninfo.name}`,
                    ephemeral: false
                });
    
            } catch (buyError) {
                console.error('Error during purchase:', buyError);
                await interaction.followUp({
                    content: 'There was an error processing your purchase. Please try again later.',
                    ephemeral: true
                });
            }
    
        } catch (error) {
            console.error('Error in buy operation:', error);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'There was an error processing your request. Please try again.',
                        ephemeral: true
                    });
                } else {
                    await interaction.followUp({
                        content: 'There was an error processing your request. Please try again.',
                        ephemeral: true
                    });
                }
            } catch (followUpError) {
                console.error('Failed to send error message:', followUpError);
            }
        }
    }


 

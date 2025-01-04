import { 
    SlashCommandBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ActionRowBuilder,
    ComponentType,
    ChatInputCommandInteraction,
    ButtonInteraction,
    EmbedBuilder,
    Message,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ModalActionRowComponentBuilder
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
import { getSmartMint } from '../../../logic/utils/getSmartMint';
import { buy as raydiumBuy } from '../../../raydium-sdk';
import { UserRepository } from '../../../service/user.repository';
const connection = new Connection(process.env.HELIUS_RPC_URL);
        
let wallet = new NodeWallet(Keypair.generate());
                
const provider = new AnchorProvider(connection, wallet, {
      commitment: "finalized",
      });
            

export const pumpService = new PumpFunSDK(provider)


    export const data = new SlashCommandBuilder()
        .setName('buy_token')
        .setDescription('View and buy tokens')
        .addStringOption(option =>
            option.setName('address')
                .setDescription('The token address')
                .setRequired(true));

    export async function execute(interaction: ChatInputCommandInteraction, user: UserType) {
        const tokenAddress = interaction.options.getString('address', true);

        const buyPriceFromConfig = await UserRepository.getBuyAmount(user.discordId);

        // Create the Buy Now button
        const buyButton = new ButtonBuilder()
            .setCustomId(`buyNow_${tokenAddress}`)
            .setLabel('Buy Now')
            .setStyle(ButtonStyle.Primary);

        const buyConfigButton = new ButtonBuilder()
            .setCustomId(`buy_setting_config`)
            .setLabel('Set Buy Price')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(buyButton)
            .addComponents(buyConfigButton);

        
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
            content: `**Copyable Token Address:**\n${tokenAddress}`,
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
                await handleBuyNow(buttonInteraction, tokenInfo, user, buyPriceFromConfig);
            }

            if (buttonInteraction.customId.startsWith('buy_setting_config')) {
                // Create the modal
                const modal = new ModalBuilder()
                    .setCustomId('buyPriceModal')
                    .setTitle('Set Buy Price');
        
                // Create the text input component
                const buyPriceInput = new TextInputBuilder()
                    .setCustomId('buyPriceInput')
                    .setLabel('Enter buy price in SOL (e.g., 0.1)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('0.1')
                    .setRequired(true);
        
                // Add the text input to an action row
                const actionRow = new ActionRowBuilder<ModalActionRowComponentBuilder>()
                    .addComponents(buyPriceInput);
        
                // Add the action row to the modal
                modal.addComponents(actionRow);
        
                // Show the modal
                await buttonInteraction.showModal(modal);
        
                try {
                    // Wait for modal submission
                    const modalSubmission = await buttonInteraction.awaitModalSubmit({
                        time: 60000, // 1 minute timeout
                        filter: i => i.user.id === buttonInteraction.user.id,
                    });
        
                    if (modalSubmission) {
                        const buyPrice = parseFloat(modalSubmission.fields.getTextInputValue('buyPriceInput'));
        
                        // Validate the input
                        if (isNaN(buyPrice) || buyPrice <= 0) {
                            await modalSubmission.reply({
                                content: 'Invalid input. Please enter a valid number greater than 0.',
                                ephemeral: true
                            });
                            return;
                        }
        
                        try {
                            // Save the buy price to the user's configuration
                            await UserRepository.setUserSetting(user.discordId,'buyAmount', buyPrice);
                            
                            await modalSubmission.reply({
                                content: `Successfully set buy price to ${buyPrice} SOL`,
                                ephemeral: true
                            });
                        } catch (error) {
                            console.error('Error saving buy price:', error);
                            await modalSubmission.reply({
                                content: 'Failed to save buy price. Please try again.',
                                ephemeral: true
                            });
                        }
                    }
                } catch (error) {
                    console.error('Modal interaction error:', error);
                    // If the modal times out, we can't reply because the interaction is no longer valid
                    // The modal will just close automatically
                }
            }
        });


    };

    export async function handleBuyNow(interaction: ButtonInteraction, tokeninfo: TokenMarketData, user: UserType, buyAmount: number) {
        try {
            // First acknowledge the button interaction
            await interaction.deferUpdate();
    
            const discordPlatform = new DiscordAdapter(interaction);
            // read buy amount form user Redis db
            const buyAmount = 0.001;
            const buyAmountLamports = BigInt(buyAmount * LAMPORTS_PER_SOL);
            const SLIPPAGE_BASIS_POINTS = 3000n;
    
            // Send initial processing message
            await interaction.followUp({
                content: `Processing purchase for token: ${tokeninfo.name}`,
                ephemeral: true
            });
    
            // For Success message
            let txSuccess = false;
            let signatures: string[] = [];

            try {
                const mint = new PublicKey(tokeninfo.tokenAddress)
                const account = await pumpService.getBondingCurveAccount(mint);
                const { mintInfo } = await getSmartMint(connection, mint);

                const shouldUsePump = account && !account.complete;
    
                if (shouldUsePump) {
                const result = await pumpService.buy(
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
                txSuccess = result.success && !!result.signature;
                if (result.signature) signatures.push(result.signature);

                } else {
                    // add raydium buy ix here
                    const result = await raydiumBuy(discordPlatform, interaction.channelId, connection, mint.toBase58(), buyAmount * Math.pow(10, mintInfo.decimals), Keypair.fromSecretKey(bs58.decode(user.encryptedPrivateKey)));

                    txSuccess = result.signatures.length > 0;
                    signatures = result.signatures;
                }
                // Get the last transaction message from the adapter, in this case it is the signature
                const txMessage = discordPlatform.getLastMessage();
                
                // Send final success message including transaction info
                if (txSuccess) {
                    await interaction.followUp({
                        content: `✅ Successfully purchased ${tokeninfo.name}`,
                        ephemeral: true
                    });
                }
            } catch (buyError) {
                console.error('Error during purchase:', buyError);
                await interaction.followUp({
                    content: `There was an error processing your purchase. Reason: ${buyError}`,
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


 

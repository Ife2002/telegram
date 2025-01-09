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
import { getTokenInfo } from "../../../logic/utils/getTokenInfo";
import { PumpFunSDK } from "pumpdotfun-sdk";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { AnchorProvider, BN } from '@coral-xyz/anchor';
import { DiscordAdapter } from '../../../lib/utils';
import bs58 from 'bs58';
import { TokenMarketData } from 'logic/utils/types';
import { UserType } from 'types/user.types';
import { getSmartMint } from '../../../logic/utils/getSmartMint';
import { buy as raydiumBuy } from '../../../raydium-sdk';
import { sell as raydiumSell } from '../../../raydium-sdk';
import { UserRepository } from '../../../service/user.repository';
import { toBigIntPrecise } from '../../../logic/utils';
import { getAccount, getAssociatedTokenAddress, getMint } from '@solana/spl-token';

const connection = new Connection(process.env.HELIUS_RPC_URL);
const wallet = new NodeWallet(Keypair.generate());
const provider = new AnchorProvider(connection, wallet, {
    commitment: "finalized",
});

export const pumpService = new PumpFunSDK(provider);

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
    const tokenInfo = await getTokenInfo(pumpService, tokenAddress);

    // Create initial embed
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
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

    // Initial buttons
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

    // Send initial message
    const response = await interaction.reply({
        content: `**Copyable Token Address:**\n${tokenAddress}`,
        embeds: [embed],
        components: [row],
        fetchReply: true
    });

    // Create button collector
    const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 3_600_000
    });

    collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
        console.log('Button clicked!');
        console.log('CustomId:', buttonInteraction.customId);


        if (buttonInteraction.user.id !== interaction.user.id) {
            await buttonInteraction.reply({
                content: 'This button is not for you!',
                ephemeral: true
            });
            return;
        }

        try {
            await buttonInteraction.deferUpdate();

            const [action, amount, tokenAddress] = buttonInteraction.customId.split('_');
            const amountNum = parseInt(amount);

            console.log('Parsed action:', action);
            console.log('Parsed amount:', amount);

            // Handle initial buy button
            if (buttonInteraction.customId.startsWith('buyNow_')) {
                await handleBuyNow(buttonInteraction, tokenInfo, user, buyPriceFromConfig);
                return;
            }

            // Handle buy settings configuration
            if (buttonInteraction.customId === 'buy_setting_config') {
                const modal = new ModalBuilder()
                    .setCustomId('buyPriceModal')
                    .setTitle('Set Buy Price');

                const buyPriceInput = new TextInputBuilder()
                    .setCustomId('buyPriceInput')
                    .setLabel('Enter buy price in SOL (e.g., 0.1)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('0.1')
                    .setRequired(true);

                const actionRow = new ActionRowBuilder<ModalActionRowComponentBuilder>()
                    .addComponents(buyPriceInput);

                modal.addComponents(actionRow);
                await buttonInteraction.showModal(modal);

                try {
                    const modalSubmission = await buttonInteraction.awaitModalSubmit({
                        time: 60000,
                        filter: i => i.user.id === buttonInteraction.user.id,
                    });

                    if (modalSubmission) {
                        const buyPrice = parseFloat(modalSubmission.fields.getTextInputValue('buyPriceInput'));

                        if (isNaN(buyPrice) || buyPrice <= 0) {
                            await modalSubmission.reply({
                                content: 'Invalid input. Please enter a valid number greater than 0.',
                                ephemeral: true
                            });
                            return;
                        }

                        await UserRepository.setUserSetting(user.discordId, 'buyAmount', buyPrice);
                        await modalSubmission.reply({
                            content: `Successfully set buy price to ${buyPrice} SOL`,
                            ephemeral: true
                        });
                    }
                } catch (error) {
                    console.error('Modal interaction error:', error);
                }
                return;
            }

            // Handle percentage-based buy/sell
            if ((action === 'buy' || action === 'sell') && !isNaN(amountNum)) {

                if (action === 'buy') {
                    const buyAmount = (buyPriceFromConfig * amountNum) / 100;
                    await handleBuyNow(buttonInteraction, tokenInfo, user, buyAmount);
                } else {
                    try {
                        await handleSellNow(buttonInteraction, tokenInfo, user, amountNum);
                    } catch (error) {
                        console.error('Error handling sell:', error);
                        await buttonInteraction.followUp({
                            content: `Error processing sell: ${error.message}`,
                            ephemeral: true
                        });
                    }
                }
                return;
            }

            // Handle refresh
            if (action === 'refresh') {
                await handleRefresh(buttonInteraction, tokenInfo, user);
                return;
            }

            // Handle custom amount modals
            if (amount === 'x') {
                await handleCustomAmount(buttonInteraction, tokenInfo, user);
                return;
            }

        } catch (error) {
            console.error('Error handling button interaction:', error);
            await buttonInteraction.followUp({
                content: `Error processing your request: ${error.message}`,
                ephemeral: true
            });
        }
    });
}

function calculateSellAmount(
    currentBalance: number,
    percentage: number,
    decimals: number
): bigint {
    try {
        // Calculate the raw amount to sell
        const amountToSell = (currentBalance * percentage) / 100;
        
        // Round to avoid floating point issues
        const roundedAmount = Math.floor(amountToSell);
        
        // Convert directly to bigint without going through the precision function
        return BigInt(roundedAmount);
        
    } catch (error) {
        console.error('Error calculating sell amount:', error);
        throw new Error(`Failed to calculate sell amount: ${error.message}`);
    }
}

async function handleRefresh(
    interaction: ButtonInteraction,
    tokenInfo: TokenMarketData,
    user: UserType
) {
    try {
    const updatedInfo = await getTokenInfo(pumpService, tokenInfo.tokenAddress);
    const tokenAccount = await getAssociatedTokenAddress(
        new PublicKey(tokenInfo.tokenAddress),
        new PublicKey(user.walletId)
    );
    
    const accountInfo = await getAccount(connection, tokenAccount);
    const mintInfo = await getMint(connection, accountInfo.mint);
    const balance = Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals);

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`🪙 ${updatedInfo.symbol} -- (${updatedInfo.name})`)
        .setDescription(`\`${tokenInfo.tokenAddress}\``)
        .addFields(
            { name: 'Balance', value: `${balance} ${updatedInfo.symbol}`, inline: true },
            { name: 'Price', value: `$${updatedInfo.price}`, inline: true },
            { name: 'Market Cap', value: `$${updatedInfo.mCap.toFixed(2)}`, inline: true }
        );

    await interaction.editReply({
        embeds: [embed]
    });

    } catch (error) {
        console.error('Error in refresh:', error);
        await interaction.followUp({
            content: `Error refreshing: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleCustomAmount(
    interaction: ButtonInteraction,
    tokenInfo: TokenMarketData,
    user: UserType
) {
    const isCustomBuy = interaction.customId === 'buy_x';
    
    const modal = new ModalBuilder()
        .setCustomId(isCustomBuy ? 'customBuyModal' : 'customSellModal')
        .setTitle(isCustomBuy ? 'Buy Custom Amount' : 'Sell Custom Amount');

    const amountInput = new TextInputBuilder()
        .setCustomId('amountInput')
        .setLabel(isCustomBuy ? 'Amount in SOL' : `Amount in ${tokenInfo.symbol}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const row = new ActionRowBuilder<ModalActionRowComponentBuilder>()
        .addComponents(amountInput);

    modal.addComponents(row);
    await interaction.showModal(modal);

    try {
        const modalSubmission = await interaction.awaitModalSubmit({
            time: 60000,
            filter: i => i.user.id === interaction.user.id,
        });

        if (modalSubmission) {
            const amount = parseFloat(modalSubmission.fields.getTextInputValue('amountInput'));
            
            if (isNaN(amount) || amount <= 0) {
                await modalSubmission.reply({
                    content: 'Please enter a valid number greater than 0',
                    ephemeral: true
                });
                return;
            }

            if (isCustomBuy) {
                await handleBuyNow(interaction, tokenInfo, user, amount);
            } else {
                // TODO: Implement handleSellNow
                await modalSubmission.reply({
                    content: 'Sell functionality coming soon!',
                    ephemeral: true
                });
            }
        }
    } catch (error) {
        console.error('Modal interaction error:', error);
    }
}

async function executeBuyOrder(
    platform: DiscordAdapter,
    channelId: string,
    user: UserType,
    tokenAddress: string,
    buyAmount: number
) {
    const buyAmountLamports = BigInt(buyAmount * LAMPORTS_PER_SOL);
    const mint = new PublicKey(tokenAddress);
    const account = await pumpService.getBondingCurveAccount(mint);
    const { mintInfo } = await getSmartMint(connection, mint);
    const shouldUsePump = account && !account.complete;

    let txSuccess = false;
    let signatures: string[] = [];

    if (shouldUsePump) {
        const result = await pumpService.buy(
            platform,
            channelId,
            Keypair.fromSecretKey(bs58.decode(user.encryptedPrivateKey)),
            mint,
            buyAmountLamports,
            3000n,
            {
                unitLimit: 300000,
                unitPrice: 300000,
            }
        );
        
        txSuccess = result.success && !!result.signature;
        if (result.signature) signatures.push(result.signature);
    } else {
        const result = await raydiumBuy(
            platform,
            channelId,
            connection,
            mint.toBase58(),
            buyAmount * Math.pow(10, mintInfo.decimals),
            Keypair.fromSecretKey(bs58.decode(user.encryptedPrivateKey))
        );
        
        txSuccess = result.signatures.length > 0;
        signatures = result.signatures;
    }

    return { txSuccess, signatures, mintInfo };
}

export async function handleBuyNow(
    interaction: ButtonInteraction, 
    tokeninfo: TokenMarketData, 
    user: UserType, 
    buyAmount: number,
    isInitialBuy: boolean = true // Flag to handle different interaction states
) {
    try {
        const platform = new DiscordAdapter(interaction);

        // Only defer if this is the initial buy
        if (isInitialBuy) {
            if (interaction.replied || interaction.deferred) {
                console.log('Interaction was already handled');
                return;
            }
            await interaction.deferUpdate();
        }

        await interaction.followUp({
            content: `Processing purchase for token: ${tokeninfo.name}`,
            ephemeral: true
        });

        const { txSuccess, signatures, mintInfo } = await executeBuyOrder(
            platform,
            interaction.channelId,
            user,
            tokeninfo.tokenAddress,
            buyAmount
        );

        if (txSuccess && signatures.length > 0) {
            const lastSignature = signatures[signatures.length - 1];
            const confirmation = await connection.confirmTransaction(lastSignature, 'processed');

            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${confirmation.value.err}`);
            }

            // Get updated balance
            const tokenAccount = await getAssociatedTokenAddress(
                new PublicKey(tokeninfo.tokenAddress), 
                new PublicKey(user.walletId)
            );
            const info = await getAccount(connection, tokenAccount, "processed");
            const balance = Number(info.amount) / (10 ** mintInfo.decimals);

            // Create embed and buttons
            const embed = createSuccessEmbed(tokeninfo, balance, lastSignature);
            const { row1, row2, row3 } = createActionButtons(tokeninfo, lastSignature);

            // Send success message
            const successMessage = await interaction.editReply({
                content: `✅ Successfully purchased ${tokeninfo.symbol}!`,
                embeds: [embed],
                components: [row1, row2, row3],
            });

            // Setup collector for the new buttons
            if (successMessage instanceof Message) {
                setupButtonCollector(successMessage, interaction, tokeninfo, user);
            }
        }
    } catch (error) {
        handleBuyError(interaction, error);
    }
}

export async function handleSellNow(
    interaction: ButtonInteraction,
    tokeninfo: TokenMarketData,
    user: UserType,
    sellPercentage: number
) {
    try {
        // First defer the update
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferUpdate();
        }

        const discordPlatform = new DiscordAdapter(interaction);
        
        // Get current balance and calculate sell amount
        const tokenAccount = await getAssociatedTokenAddress(
            new PublicKey(tokeninfo.tokenAddress),
            new PublicKey(user.walletId)
        );
        const accountInfo = await getAccount(connection, tokenAccount);
        const currentBalance = Number(accountInfo.amount);
        const mintInfo = await getMint(connection, accountInfo.mint);

        // Calculate sell amount
        const sellAmountBN = BigInt(Math.floor((currentBalance * sellPercentage) / 100));
        
        console.log('Selling:', {
            currentBalance,
            sellPercentage,
            sellAmount: sellAmountBN.toString()
        });

        await discordPlatform.sendMessage(
            interaction.channelId,
            `Processing sale of ${Number(sellAmountBN) / Math.pow(10, mintInfo.decimals)} ${tokeninfo.symbol} (${sellPercentage}%)`
        );

        let txSuccess = false;
        let signatures: string[] = [];

        try {
            const account = await pumpService.getBondingCurveAccount(
                new PublicKey(tokeninfo.tokenAddress)
            );
            const shouldUsePump = account && !account.complete;

            if (shouldUsePump) {
                await discordPlatform.sendMessage(
                    interaction.channelId, 
                    "Executing Sell - (pre-bonding phase)..."
                );
                
                const result = await pumpService.sell(
                    discordPlatform,
                    interaction.channelId,
                    Keypair.fromSecretKey(bs58.decode(user.encryptedPrivateKey)),
                    new PublicKey(tokeninfo.tokenAddress),
                    sellAmountBN,
                    3000n,
                    {
                        unitLimit: 300000,
                        unitPrice: 300000,
                    }
                );

                // If we have a signature, consider it worth checking
                if (result.signature) {
                    signatures.push(result.signature);
                    txSuccess = true;
                }
            } else {
                await discordPlatform.sendMessage(
                    interaction.channelId, 
                    "Executing Sell - (post-bonding phase)..."
                );

                const result = await raydiumSell(
                    discordPlatform,
                    interaction.channelId,
                    connection,
                    tokeninfo.tokenAddress,
                    Number(sellAmountBN),
                    Keypair.fromSecretKey(bs58.decode(user.encryptedPrivateKey))
                );

                if (result.signatures && result.signatures.length > 0) {
                    signatures = result.signatures;
                    txSuccess = true;
                }
            }

            // Process transaction confirmation
            if (signatures.length > 0) {
                const lastSignature = signatures[signatures.length - 1];
                console.log('Confirming signature:', lastSignature);

                const confirmation = await connection.confirmTransaction(lastSignature, 'processed');
                console.log('Confirmation result:', confirmation);

                if (confirmation.value.err) {
                    throw new Error(`Transaction failed: ${confirmation.value.err}`);
                }

                // Get updated balance
                const updatedInfo = await getAccount(connection, tokenAccount, "processed");
                const updatedBalance = Number(updatedInfo.amount) / Math.pow(10, mintInfo.decimals);

                // Create success embed
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle(`💰 SOLD ${tokeninfo.symbol} -- (${tokeninfo.name})`)
                    .setDescription(`\`${tokeninfo.tokenAddress}\``)
                    .addFields(
                        { name: 'New Balance', value: `${updatedBalance} ${tokeninfo.symbol}`, inline: true },
                        { name: 'Amount Sold', value: `${Number(sellAmountBN) / Math.pow(10, mintInfo.decimals)} ${tokeninfo.symbol}`, inline: true },
                        { name: 'Sale %', value: `${sellPercentage}%`, inline: true }
                    )
                    .addFields({
                        name: 'Transaction',
                        value: `[View on Solscan](https://solscan.io/tx/${lastSignature})`,
                        inline: false
                    });

                // Create action rows with buttons (using the fixed button code from earlier)
                const { row1, row2, row3 } = createActionButtons(tokeninfo, lastSignature);

                // Update the message with new balance and transaction info
                await interaction.editReply({
                    content: `✅ Successfully sold ${tokeninfo.symbol}!`,
                    embeds: [embed],
                    components: [row1, row2, row3],
                });

            } else {
                throw new Error('No transaction signature received');
            }

        } catch (error) {
            console.error('Sell transaction failed:', error);
            await discordPlatform.sendMessage(
                interaction.channelId,
                `Failed to execute sell: ${error.message}`
            );
            throw error;
        }

    } catch (error) {
        console.error('Error in sell operation:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: `Error processing your sell request: ${error.message}`,
                ephemeral: true
            });
        } else {
            await interaction.followUp({
                content: `Error processing your sell request: ${error.message}`,
                ephemeral: true
            });
        }
    }
}

function setupButtonCollector(
    message: Message,
    originalInteraction: ButtonInteraction,
    tokeninfo: TokenMarketData,
    user: UserType
) {
    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 3_600_000
    });

    collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
        if (buttonInteraction.user.id !== originalInteraction.user.id) {
            await buttonInteraction.reply({
                content: 'This button is not for you!',
                ephemeral: true
            });
            return;
        }

        try {
            await buttonInteraction.deferUpdate();

            const [action, amount, tokenAddress] = buttonInteraction.customId.split('_');
            const amountNum = parseInt(amount);

            if (action === 'buy' && !isNaN(amountNum)) {
                const buyPriceFromConfig = await UserRepository.getBuyAmount(buttonInteraction.user.id);
                const buyAmount = (buyPriceFromConfig * amountNum) / 100;
                const platform = new DiscordAdapter(buttonInteraction);

                const result = await executeBuyOrder(
                    platform,
                    buttonInteraction.channelId,
                    user,
                    tokenAddress,
                    buyAmount
                );

                if (result.txSuccess) {
                    await refreshTokenDisplay(buttonInteraction, tokeninfo, user);
                }
            }

            if (action === 'sell') {
                try {
                    await handleSellNow(buttonInteraction, tokeninfo, user, amountNum);
                } catch (error) {
                    console.error('Error handling sell:', error);
                    await buttonInteraction.followUp({
                        content: `Error processing sell: ${error.message}`,
                        ephemeral: true
                    });
                }
            }

            if (amount === 'x') {
                await handleCustomAmount(buttonInteraction, tokeninfo, user);
            }

            if (action === 'refresh') {
                await handleRefresh(buttonInteraction, tokeninfo, user);
            }

        } catch (error) {
            console.error('Error handling button interaction:', error);
            await buttonInteraction.followUp({
                content: `Error: ${error.message}`,
                ephemeral: true
            });
        }
    });
}


function createSuccessEmbed(tokeninfo: TokenMarketData, balance: number, signature: string) {
    // Create success message embed
    const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle(`🪙 BOUGHT ${tokeninfo.symbol} -- (${tokeninfo.name})`)
    .setDescription(`\`${tokeninfo.tokenAddress}\``)
    .addFields(
        { name: 'Balance', value: `${balance} ${tokeninfo.symbol}`, inline: true },
        { name: 'Price', value: `$${tokeninfo.price}`, inline: true },
        { name: 'Market Cap', value: `$${tokeninfo.mCap.toFixed(2)}`, inline: true }
    );
    
    // Add transaction URL to embed
    embed.addFields({
        name: 'Transaction',
        value: `[View on Solscan](https://solscan.io/tx/${signature})`,
        inline: false
    });

    return embed;
}


function createActionButtons(tokeninfo: TokenMarketData, signature: string) {
    const row1 = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`sell_10_${tokeninfo.tokenAddress}`) // Add tokenAddress to make it unique
                            .setLabel('Sell 10%')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`sell_25_${tokeninfo.tokenAddress}`)
                            .setLabel('Sell 25%')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`sell_50_${tokeninfo.tokenAddress}`)
                            .setLabel('Sell 50%')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`sell_75_${tokeninfo.tokenAddress}`)
                            .setLabel('Sell 75%')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`sell_100_${tokeninfo.tokenAddress}`)
                            .setLabel('Sell 100%')
                            .setStyle(ButtonStyle.Primary)
                    );

                const row2 = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`buy_10_${tokeninfo.tokenAddress}`)
                            .setLabel(`Buy 10% more`)
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`buy_25_${tokeninfo.tokenAddress}`)
                            .setLabel(`Buy 25% more`)
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`buy_50_${tokeninfo.tokenAddress}`)
                            .setLabel(`Buy 50% more`)
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`buy_75_${tokeninfo.tokenAddress}`)
                            .setLabel(`Buy 75% more`)
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId(`buy_100_${tokeninfo.tokenAddress}`)
                            .setLabel(`Buy 100% more`)
                            .setStyle(ButtonStyle.Secondary)
                    );
            
            const row3 = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`sell_x_${tokeninfo.tokenAddress}`)
                        .setLabel(`Sell X amount`)
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`buy_x_${tokeninfo.tokenAddress}`)
                        .setLabel(`Buy X amount`)
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`refresh_${tokeninfo.tokenAddress}`)
                        .setLabel(`Refresh`)
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setURL(`https://birdeye.so/token/${tokeninfo.tokenAddress}?chain=solana`)
                        .setLabel(`Birdeye`)
                        .setStyle(ButtonStyle.Link),
                    new ButtonBuilder()
                        .setURL(`https://solscan.io/tx/${signature}`)
                        .setLabel(`Solscan`)
                        .setStyle(ButtonStyle.Link)    
                );
    
    return { row1, row2, row3 };
}


async function refreshTokenDisplay(
    interaction: ButtonInteraction,
    tokeninfo: TokenMarketData,
    user: UserType
) {
    await handleRefresh(interaction, tokeninfo, user);
}


function handleBuyError(interaction: ButtonInteraction, error: any) {
    console.error('Error in buy operation:', error);
    try {
        const errorMessage = 'There was an error processing your request. Please try again.';
        if (!interaction.replied && !interaction.deferred) {
            interaction.reply({
                content: errorMessage,
                ephemeral: true
            });
        } else {
            interaction.followUp({
                content: errorMessage,
                ephemeral: true
            });
        }
    } catch (followUpError) {
        console.error('Failed to send error message:', followUpError);
    }
}
 

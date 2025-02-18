// add slippage and default fee params in raydium buy and sell...
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
import { getTokenInfo } from "../../../logic/utils/astralane";
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
// import { UserRepository } from '../../../service/user.repository';
import { toBigIntPrecise } from '../../../logic/utils';
import { getAccount, getAssociatedTokenAddress, getMint } from '@solana/spl-token';
import { getPriorityFees } from '../../../logic/utils/getPriorityFees';
import { parseUINumber } from '../../../logic/utils/numberUI';
import { User } from 'src/user/entities/user.entity';
import { AvalancheDiscordClient } from 'discord';
import { UserService } from 'src/user/user.service';

const connection = new Connection(process.env.HELIUS_RPC_URL);
const wallet = new NodeWallet(Keypair.generate());
const provider = new AnchorProvider(connection, wallet, {
    commitment: "finalized",
});

export const pumpService = new PumpFunSDK(provider);

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
    user: User
) {
    try {
    const updatedInfo = await getTokenInfo(tokenInfo.tokenAddress);
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
            { name: 'Balance', value: `${balance} ${updatedInfo.symbol}`, inline: false },
            { name: 'Price', value: `$${Number(updatedInfo.price).toFixed(8)}`, inline: false },
            { name: 'Market Cap', value: `$${parseUINumber(updatedInfo.mCap)}`, inline: false }
        );

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
    user: User,
    userService: UserService,
) {
    const isCustomBuy = interaction.customId === 'buy_x';
    
    const modal = new ModalBuilder()
        .setCustomId(isCustomBuy ? 'customBuyModal' : 'customSellModal')
        .setTitle(isCustomBuy ? 'Buy Custom Amount' : 'Sell Custom Amount');

    const amountInput = new TextInputBuilder()
        .setCustomId('amountInput')
        .setLabel(isCustomBuy ? 'Amount in SOL' : `Amount in ${tokenInfo?.symbol}`)
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
                await handleBuyNow(interaction, userService, tokenInfo, user, amount);
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
    user: User,
    tokenAddress: string,
    buyAmount: number,
    userService: UserService,
) {

    const { hasBalance, currentBalance } = await hasEnoughBalance(
        connection, 
        user.walletId, 
        buyAmount
    );

    if (!hasBalance) {
        throw new Error(
            `Insufficient balance. You need ${(buyAmount + 0.01)} SOL (including fees) but only have ${currentBalance.toFixed(5)} SOL`
        );
    }

    const buyAmountLamports = BigInt(buyAmount * LAMPORTS_PER_SOL);
    const mint = new PublicKey(tokenAddress);
    const account = await pumpService.getBondingCurveAccount(mint);
    const { mintInfo } = await getSmartMint(connection, mint);
    const shouldUsePump = account && !account.complete;

    let txSuccess = false;
    let signatures: string[] = [];

    // Fetch dynamic priority fees from Raydium
    const priorityFees = await getPriorityFees();

    // this is basically the nozomi tip
    const defaultPriorityFee = await userService.getDefaultPriorityFee(user.discordId);

    const nozomiEnabled = await userService.getNozomiBuyEnabled(user.discordId)

    const slippage = await userService.getSlippage(user.discordId)

    const slippageBasisPointRounded = slippage * 100;

    // Math round is tech debt
    const slippageBigInt = BigInt(Math.round(slippageBasisPointRounded));

    if (shouldUsePump) {
        const result = await pumpService.buy(
            platform,
            channelId,
            Keypair.fromSecretKey(bs58.decode(user.encryptedPrivateKey)),
            mint,
            buyAmountLamports,
            slippageBigInt,
            defaultPriorityFee,
            priorityFees,
            nozomiEnabled
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
            Keypair.fromSecretKey(bs58.decode(user.encryptedPrivateKey)),
            Number(slippage),
            nozomiEnabled,
        );
        
        txSuccess = result.signatures.length > 0;
        signatures = result.signatures;
    }

    return { txSuccess, signatures, mintInfo };
}

export async function handleBuyNow(
    interaction: ButtonInteraction,
    userService: UserService,
    tokeninfo: TokenMarketData,
    user: User,
    buyAmount: number,
    isInitialBuy: boolean = true,
) {
    try {
        // Initial defer
        if (isInitialBuy && !interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(console.error);
        }

        // Check balance - tech should check for auto nozomi tip is nozomi is enabled
        const { hasBalance, currentBalance } = await hasEnoughBalance(
            connection,
            user.walletId,
            buyAmount
        );

        if (!hasBalance) {
            await interaction.followUp({
                content: `Insufficient balance. You need ${(buyAmount + 0.01)} SOL (including fees) but only have ${currentBalance.toFixed(5)} SOL`,
                ephemeral: true
            }).catch(console.error);
            return;
        }

        // Send processing message
        await interaction.followUp({
            content: `Processing purchase for token: ${tokeninfo?.name}`,
            ephemeral: true
        }).catch(console.error);

        const platform = new DiscordAdapter(interaction);

        // Execute buy order
        const { txSuccess, signatures, mintInfo } = await executeBuyOrder(
            platform,
            interaction.channelId,
            user,
            tokeninfo?.tokenAddress,
            buyAmount, 
            userService,
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

            // Send new success message instead of editing
            const successMessage = await interaction.followUp({
                content: `✅ Successfully purchased ${tokeninfo.symbol}!`,
                embeds: [embed],
                components: [row1, row2, row3],
                ephemeral: false
            });

            if (successMessage instanceof Message) {
                setupButtonCollector(successMessage, interaction, tokeninfo, user);
            }
        }
    } catch (error) {
        await handleBuyError(interaction, error).catch(console.error);
    }
}

export async function handleSellNow(
    interaction: ButtonInteraction,
    tokeninfo: TokenMarketData,
    user: User,
    sellPercentage: number,
    userService: UserService,
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

            const priorityFees = await getPriorityFees();

            // basically the nozomi tip
            const defaultPriorityFee = await userService.getDefaultPriorityFee(user.discordId);

            const slippage = await userService.getSlippage(user.discordId)

            const slippageBasisPointRounded = slippage * 100;

            // Math round is tech debt
            const slippageBigInt = BigInt(Math.round(slippageBasisPointRounded));

            const nozomiEnabled = await userService.getNozomiBuyEnabled(user.discordId);

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
                    slippageBigInt,
                    defaultPriorityFee,
                    priorityFees,
                    nozomiEnabled
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
                    Keypair.fromSecretKey(bs58.decode(user.encryptedPrivateKey)),
                    slippage,
                    nozomiEnabled,
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
                await interaction.followUp({
                    content: `✅ Successfully sold ${tokeninfo.symbol}!`,
                    embeds: [embed],
                    components: [row1, row2, row3],
                    ephemeral: false
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
    user: User
) {
    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 3_600_000
    });

    collector.on('collect', async (buttonInteraction: ButtonInteraction) => {

        const userService = (buttonInteraction.client as AvalancheDiscordClient).userService;
        
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
                const buyPriceFromConfig = await userService.getBuyAmount(buttonInteraction.user.id);
                const buyAmount = (buyPriceFromConfig * amountNum) / 100;
                const platform = new DiscordAdapter(buttonInteraction);

                const result = await executeBuyOrder(
                    platform,
                    buttonInteraction.channelId,
                    user,
                    tokenAddress,
                    buyAmount,
                    userService
                );

                if (result.txSuccess) {
                    await refreshTokenDisplay(buttonInteraction, tokeninfo, user);
                }
            }

            if (action === 'sell') {
                try {
                    await handleSellNow(buttonInteraction, tokeninfo, user, amountNum, userService);
                } catch (error) {
                    console.error('Error handling sell:', error);
                    await buttonInteraction.followUp({
                        content: `Error processing sell: ${error.message}`,
                        ephemeral: true
                    });
                }
            }

            if (amount === 'x') {
                await handleCustomAmount(buttonInteraction, tokeninfo, user, userService);
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
        { name: 'Balance', value: `${balance.toFixed(2)} ${tokeninfo.symbol}`, inline: true },
        { name: 'Price', value: `$${Number(tokeninfo.price).toFixed(8)}`, inline: true },
        { name: 'Market Cap', value: `$${parseUINumber(tokeninfo.mCap.toFixed(2))}`, inline: true }
    );
    
    // Add transaction URL to embed
    embed.addFields({
        name: 'Transaction',
        value: `[View on Solscan](https://solscan.io/tx/${signature})`,
        inline: false
    });

    return embed;
}


export function createActionButtons(tokeninfo: TokenMarketData, signature: string) {
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
    user: User
) {
    await handleRefresh(interaction, tokeninfo, user);
}


async function handleBuyError(interaction: ButtonInteraction, error: any) {
    console.error('Error in buy operation:', error);
    try {
        let errorMessage = 'There was an error processing your request. Please try again.';
        
        // Check for specific error types
        if (error.message.includes('Insufficient balance')) {
            errorMessage = error.message; // Use the formatted balance error message
        } else if (error.message.includes('block height exceeded')) {
            errorMessage = 'Transaction timed out. Please try again.';
        }

        const options = {
            content: errorMessage,
            flags: 64 // Ephemeral flag
        };

        // Return the Promise from the interaction methods
        if (!interaction.replied && !interaction.deferred) {
            return await interaction.reply(options);
        } else {
            return await interaction.followUp(options);
        }
    } catch (followUpError) {
        console.error('Failed to send error message:', followUpError);
        throw followUpError; // Re-throw to allow for catch chaining
    }
}

//helper function to check balance
async function hasEnoughBalance(
    connection: Connection,
    walletId: string,
    requiredAmount: number
): Promise<{hasBalance: boolean, currentBalance: number}> {
    try {
        const MAX_TRANSACTION_FEE = 0.5; // Maximum Solana tx fee in SOL - Pull from nozomi, use default priority fee and 
        const balance = await connection.getBalance(new PublicKey(walletId));
        const balanceInSOL = balance / LAMPORTS_PER_SOL;
        const requiredWithFee = requiredAmount + MAX_TRANSACTION_FEE;

        return {
            hasBalance: balanceInSOL >= requiredWithFee,
            currentBalance: balanceInSOL
        };
    } catch (error) {
        console.error('Error checking balance:', error);
        throw new Error('Failed to check wallet balance');
    }
}
 

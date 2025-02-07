import { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonInteraction, 
    ButtonStyle, 
    ChatInputCommandInteraction, 
    EmbedBuilder,
    Message,
    SlashCommandBuilder 
} from 'discord.js';
import { ISettings, UserType } from '../../../types/user.types';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { UserRepository } from '../../../service/user.repository';
import { DMCollectorService, Validators } from '../../utils/dmCollectors';
import { AvalancheDiscordClient } from '../../index';
import { UserService } from '../../../src/user/user.service';

// Command definition
const data = new SlashCommandBuilder()
    .setName('me')
    .setDescription('Information about your wallet and config setting');

// util function for prirority formatting
function formatPriorityFee(sol: number | null | undefined): string {
        if (!sol) return 'Not set';
        return `${sol} SOL`;
        // Alternatively, if you want to show in SOL:
        // return `${lamports / 1e9} SOL`;
    }

// Button creators
function createButtons() {
    // const copyButton = new ButtonBuilder()
    //     .setCustomId('copy_address')
    //     .setLabel('Copy Address')
    //     .setStyle(ButtonStyle.Secondary);

    const settingButton = new ButtonBuilder()
        .setCustomId('settings')
        .setLabel('Settings')
        .setStyle(ButtonStyle.Primary);

    return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(settingButton);
}

async function createSettingsButtons(user: UserType, userService: UserService) {
    const adjustBuyAmountButton = new ButtonBuilder()
        .setCustomId('adjust_buy_amount')
        .setLabel('Adjust Buy Amount')
        .setStyle(ButtonStyle.Primary);

    const adjustSlippageButton = new ButtonBuilder()
        .setCustomId('adjust_slippage')
        .setLabel('Adjust Slippage')
        .setStyle(ButtonStyle.Primary);

    const adjustDefaultPriorityFee = new ButtonBuilder()
        .setCustomId('adjust_priorityFee')
        .setLabel('Adjust Default Priority fee')
        .setStyle(ButtonStyle.Primary);

    const isNozomiEnabled = await userService.getNozomiBuyEnabled(user.discordId);

    const nozomiButton = createNozomiToggleButton(isNozomiEnabled)

    // Create two separate rows
    const firstRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(adjustBuyAmountButton, adjustSlippageButton, nozomiButton);

    const secondRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(adjustDefaultPriorityFee);

    return [firstRow, secondRow];
}

// Embed creators
function createWalletEmbed(user: UserType, solBalance: number, userSetting: ISettings) {
    return new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Your Wallet Information')
        .addFields(
            { name: 'Address', value: `\`\`\`${user.walletId}\`\`\`` },
            { name: 'Balance', value: `\`${solBalance / LAMPORTS_PER_SOL}\`` }
        )
        .setTimestamp();
}

async function createSettingsEmbed(user: UserType, userService: UserService) {
    
    const slippage = await userService.getUserSetting(user.discordId, "slippage");
    const buyAmount = await userService.getUserSetting(user.discordId, "buyAmount");
    const defaultSolPriorityFeeinLamport = await userService.getUserSetting(user.discordId, "defaultPriorityFee");


    return new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Your Settings')
        .addFields(
            { name: 'Buy Amount', value: `${buyAmount || 'Not set'}` },
            { name: 'Slippage', value: `${slippage || '2.5'}%` },
            { name: 'Default Priority Fee', value: formatPriorityFee(defaultSolPriorityFeeinLamport) },
        )
        .setTimestamp();
}

// Button handlers
async function handleCopyAddress(interaction: ButtonInteraction, user: UserType) {
    
    await interaction.reply({
        content: `Address copied: \`${user.walletId}\``,
        ephemeral: true
    });
}

async function handleSettings(interaction: ButtonInteraction, user: UserType, userService: UserService) {

    const settingsEmbed = await createSettingsEmbed(user, userService);
    const settingsButtons = await createSettingsButtons(user, userService);
    

    await interaction.reply({
        embeds: [settingsEmbed],
        components: settingsButtons,
        ephemeral: true
    });
}


async function handleSlippage(interaction: ButtonInteraction, user: UserType, userService: UserService) {

    try {
        await DMCollectorService.collectDM(interaction, {
            prompt: "Please enter your desired slippage percentage (e.g., 3.5). Recommended: 1-5%",
            validator: Validators.percentage,
            async onSuccess(message, value) {
                // Save the slippage value
                await userService.updateSlippage(user.discordId, value);
                
                // Get the updated slippage to confirm
                const slippage = await userService.getSlippage(user.discordId);

                const updatedSettingsEmbed = await createSettingsEmbed(user, userService);
                
                // Send confirmation: optimally it should return the setting its on currently with the sucess message
                await message.reply({
                    content: `✅ Slippage has been set to ${slippage}%`,
                    embeds: [updatedSettingsEmbed],
                    components: await createSettingsButtons(user, userService)
                });
            },
            async onError(message, error) {
                await message.reply(`❌ ${error}. Please enter a valid percentage between 0 and 100.`);
            },
            timeout: 30000 // 30 seconds to respond
        });
    } catch (error) {
        console.error('Error in handleSlippage:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: '❌ An error occurred while setting slippage. Please try again.',
                ephemeral: true
            });
        }
    }
}

async function handleDefaultPriorityFee(interaction: ButtonInteraction, user: UserType, userService: UserService) {
    try {

        // Remove the deferUpdate and followUp from here since DMCollectorService handles it
        await DMCollectorService.collectDM(interaction, {
            prompt: "Please enter your desired Priority fee in SOL (e.g. 0.01). Recommended: 0.01",
            validator: Validators.priorityFees,
            async onSuccess(message, value) {
                console.log('DM collector success:', { value });
                try {
                    await userService.updateDefaultPriorityFee(user.discordId, value);
                    const defaultPriorityFee = await userService.getDefaultPriorityFee(user.discordId);

                    const updatedSettingsEmbed = await createSettingsEmbed(user, userService);
                    
                    // Send DM confirmation
                    await message.reply({
                        content: `✅ Default Priority fee has been set to ${defaultPriorityFee} SOL`,
                        embeds: [updatedSettingsEmbed],
                        components: await createSettingsButtons(user, userService)
                    });

                } catch (error) {
                    console.error('Error in priority fee onSuccess:', error);
                    await message.reply('❌ An error occurred while saving your priority fee.');
                }
            },
            async onError(message, error) {
                console.error('DM collector error:', error);
                await message.reply(`❌ ${error}. Please enter a valid value between 0 and 0.5.`);
            },
            timeout: 1000000
        });

    } catch (error) {
        console.error('Error in handleDefaultPriorityFee:', error);
        // DMCollectorService handles the error responses, so we don't need to handle them here
    }
}

async function handleBuyAmount(interaction: ButtonInteraction, user: UserType, userService: UserService) {
    try {
        // Remove the deferUpdate and followUp from here since DMCollectorService handles it
        await DMCollectorService.collectDM(interaction, {
            prompt: "Please enter your desired Buy amount in SOL (e.g. 0.01)",
            validator: Validators.priorityFees,
            async onSuccess(message, value) {
                console.log('DM collector success:', { value });
                try {
                    await userService.updateBuyAmount(user.discordId, value);
                    const defaultPriorityFee = await userService.getBuyAmount(user.discordId);

                    const updatedSettingsEmbed = await createSettingsEmbed(user, userService);
                    
                    // Send DM confirmation
                    await message.reply({
                        content: `✅ Default buy amount has been set to ${defaultPriorityFee} SOL`,
                        embeds: [updatedSettingsEmbed],
                        components: await createSettingsButtons(user, userService)
                    });

                } catch (error) {
                    console.error('Error in priority fee onSuccess:', error);
                    await message.reply('❌ An error occurred while saving your priority fee.');
                }
            },
            async onError(message, error) {
                console.error('DM collector error:', error);
                await message.reply(`❌ ${error}. Please enter a valid value between 0 and 0.5.`);
            },
            timeout: 1000000
        });

    } catch (error) {
        console.error('Error in handleDefaultPriorityFee:', error);
        // DMCollectorService handles the error responses, so we don't need to handle them here
    }
}

async function handleToggleNozomi(interaction: ButtonInteraction, user: UserType, userService: UserService) {
    try {
        if (!interaction.deferred) {
            await interaction.deferUpdate();
        }

        // Get current toggle state from user repository
        const currentState = await userService.getNozomiBuyEnabled(user.discordId);
        const newState = !currentState; // Toggle the state

        await userService.setNozomiBuyEnabled(user.discordId, newState);

        // Update the state in the database
        const updatedSettingsEmbed = await createSettingsEmbed(user, userService);

        // Get updated buttons with the new state
        const updatedSettingsButtons = await createSettingsButtons(user, userService);





        // Send confirmation message to user
        await interaction.followUp({
            content: newState 
                ? '✅ Fastlane Buy has been enabled!'
                : '❌ Fastlane Buy has been disabled!',
            embeds: [updatedSettingsEmbed],
            components: updatedSettingsButtons,
            ephemeral: false
        });

    } catch (error) {
        console.error('Error in handleToggleNozomi:', error);

        // Only send error message if we haven't replied yet
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while toggling Nozomi Buy status.',
                ephemeral: true
            });
        } else {
            await interaction.followUp({
                content: '❌ An error occurred while toggling Nozomi Buy status.',
                ephemeral: true
            });
        }
    }
}

export function createNozomiToggleButton(isEnabled: boolean = false) {
    return new ButtonBuilder()
        .setCustomId('toggle_nozomi')
        .setLabel(isEnabled ? 'Fastlane Buy: ON' : 'Fastlane Buy: OFF')
        .setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Secondary);
}


// Main execute function
async function execute(interaction: ChatInputCommandInteraction, user: UserType) {
    const userService = (interaction.client as AvalancheDiscordClient).userService;
    try {
        const connection = new Connection(process.env.HELIUS_RPC_URL);
        const solBalance = await connection.getBalance(new PublicKey(user.walletId));

        const mainButtons = createButtons();
        const walletEmbed = createWalletEmbed(user, solBalance, user.settings);

        // Send initial message
        const reply = await interaction.reply({
            content: `${user.walletId}`,
            embeds: [walletEmbed],
            components: [mainButtons],
            fetchReply: true
        });

        const filter = i => {
            const validButtons = [
                'copy_address', 
                'settings', 
                'adjust_slippage', 
                'adjust_priorityFee',
                'adjust_buy_amount', 
                'toggle_nozomi' 
            ];
            return validButtons.includes(i.customId) && i.user.id === interaction.user.id;
        };

        const collector = interaction.channel.createMessageComponentCollector({ 
            filter, 
            time: 60000 
        });

        // Handle button clicks
        collector.on('collect', async (i: ButtonInteraction) => {
            try {
                switch (i.customId) {
                    case 'copy_address':
                        await handleCopyAddress(i, user);
                        break;
                    case 'settings':
                        await handleSettings(i, user, userService);
                        break;
                    case 'adjust_slippage':
                        await handleSlippage(i, user, userService);
                        break;
                    case 'adjust_priorityFee':
                        await handleDefaultPriorityFee(i, user, userService);
                        break;
                    case 'adjust_buy_amount':
                        await handleBuyAmount(i, user, userService);
                        break;
                    case 'toggle_nozomi':
                        await handleToggleNozomi(i, user, userService);
                        break;
                    default:                   
                        if (!i.deferred && !i.replied) {
                            await i.reply({
                                content: 'Unknown button interaction',
                                ephemeral: true
                            });
                        }
                }
            } catch (error) {
                console.error(`Error handling button ${i.customId}:`, error);
                try {
                    if (!i.replied && !i.deferred) {
                        await i.reply({
                            content: '❌ An error occurred while processing your request. Please try again.',
                            ephemeral: true
                        });
                    }
                } catch (responseError) {
                    console.error('Error sending error response:', responseError);
                }
            }
        });

        collector.on('end', async () => {
            try {
                // Disable all buttons when collector ends
                const disabledButtons = mainButtons.setComponents(
                    mainButtons.components.map(button => button.setDisabled(true))
                );

                if (reply instanceof Message) {
                    await reply.edit({
                        components: [disabledButtons]
                    });
                }
            } catch (error) {
                console.error('Error disabling buttons:', error);
            }
        });
    } catch (error) {
        console.error('Error in execute:', error);
        if (!interaction.replied) {
            await interaction.reply({
                content: '❌ An error occurred while setting up the wallet interface. Please try again.',
                ephemeral: true
            });
        }
    }
}

module.exports = { data, execute };

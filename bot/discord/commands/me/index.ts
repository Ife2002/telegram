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

function createSettingsButtons() {
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


    const toggleNozomiButton = new ButtonBuilder()
        .setCustomId('toggle_nozomi')
        .setLabel('Toggle Nozomi Buy')
        .setStyle(ButtonStyle.Secondary);

    // Create two separate rows
    const firstRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(adjustBuyAmountButton, adjustSlippageButton, toggleNozomiButton);

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

async function createSettingsEmbed(user: UserType) {
    
    const slippage = await UserRepository.getUserSetting(user.discordId, "slippage");
    const buyAmount = await UserRepository.getUserSetting(user.discordId, "buyAmount");
    const defaultSolPriorityFeeinLamport = await UserRepository.getUserSetting(user.discordId, "defaultPriorityFee");


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

async function handleSettings(interaction: ButtonInteraction, user: UserType) {

    const settingsEmbed = await createSettingsEmbed(user);
    const settingsButtons = createSettingsButtons();

    await interaction.reply({
        embeds: [settingsEmbed],
        components: settingsButtons,
        ephemeral: true
    });
}


async function handleSlippage(interaction: ButtonInteraction, user: UserType) {

    try {
        await DMCollectorService.collectDM(interaction, {
            prompt: "Please enter your desired slippage percentage (e.g., 3.5). Recommended: 1-5%",
            validator: Validators.percentage,
            async onSuccess(message, value) {
                // Save the slippage value
                await UserRepository.setSlippage(user.discordId, value);
                
                // Get the updated slippage to confirm
                const slippage = await UserRepository.getSlippage(user.discordId);
                
                // Send confirmation: optimally it should return the setting its on currently with the sucess message
                await message.reply({
                    content: `✅ Slippage has been set to ${slippage}%`,
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

async function handleDefaultPriorityFee(interaction: ButtonInteraction, user: UserType) {
    try {
        console.log('Starting handleDefaultPriorityFee, interaction state:', {
            replied: interaction.replied,
            deferred: interaction.deferred,
            ephemeral: interaction.ephemeral
        });

        // Remove the deferUpdate and followUp from here since DMCollectorService handles it
        await DMCollectorService.collectDM(interaction, {
            prompt: "Please enter your desired Priority fee in SOL (e.g. 0.01). Recommended: 0.01",
            validator: Validators.priorityFees,
            async onSuccess(message, value) {
                console.log('DM collector success:', { value });
                try {
                    await UserRepository.setDefaultPriorityFee(user.discordId, value);
                    const defaultPriorityFee = await UserRepository.getDefaultPriorityFee(user.discordId);
                    
                    // Send DM confirmation
                    await message.reply({
                        content: `✅ Default Priority fee has been set to ${defaultPriorityFee} SOL`,
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
            timeout: 100000
        });

    } catch (error) {
        console.error('Error in handleDefaultPriorityFee:', error);
        // DMCollectorService handles the error responses, so we don't need to handle them here
    }
}

async function handleBuyAmount(interaction: ButtonInteraction, user: UserType) {
          console.log('Buy Amount')
          console.log(interaction, user)
}

async function handleToggleNozomi(interaction: ButtonInteraction, user: UserType) {
    console.log('Nozomi')
    console.log(interaction, user)
}


// Main execute function
async function execute(interaction: ChatInputCommandInteraction, user: UserType) {
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
                        await handleSettings(i, user);
                        break;
                    case 'adjust_slippage':
                        await handleSlippage(i, user);
                        break;
                    case 'adjust_priorityFee':
                        await handleDefaultPriorityFee(i, user);
                        break;
                    case 'adjust_buy_amount':
                        await handleBuyAmount(i, user);  // Add this handler
                        break;
                    case 'toggle_nozomi':
                        await handleToggleNozomi(i, user);  // Add this handler
                        break;
                    default:
                        console.log(`Unhandled button ID: ${i.customId}`);
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

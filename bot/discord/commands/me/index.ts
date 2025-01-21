import { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonInteraction, 
    ButtonStyle, 
    ChatInputCommandInteraction, 
    EmbedBuilder,
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
    const copyButton = new ButtonBuilder()
        .setCustomId('copy_address')
        .setLabel('Copy Address')
        .setStyle(ButtonStyle.Secondary);

    const settingButton = new ButtonBuilder()
        .setCustomId('settings')
        .setLabel('Settings')
        .setStyle(ButtonStyle.Primary);

    return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(copyButton, settingButton);
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
    /// recomended should be based on nozomi api median tip
    try {
        await DMCollectorService.collectDM(interaction, {
            prompt: "Please enter your desired Priority fee in SOl (e.g. 0.01). Recommended: 0.01",
            validator: Validators.priorityFees,
            async onSuccess(message, value) {
                // Save the slippage value
                await UserRepository.setDefaultPriorityFee(user.discordId, value);
                
                // Get the updated priority fee to confirm
                const defaultPriorityFee = await UserRepository.getDefaultPriorityFee(user.discordId);
                
                // Send confirmation: optimally it should return the setting its on currently with the sucess message
                await message.reply({
                    content: `✅ Default Priority fee has been set to ${defaultPriorityFee} SOL`,
                });
            },
            async onError(message, error) {
                await message.reply(`❌ ${error}. Please enter a valid percentage between 0 and 0.5.`);
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


// Main execute function
async function execute(interaction: ChatInputCommandInteraction, user: UserType) {
    const connection = new Connection(process.env.HELIUS_RPC_URL);
    const solBalance = await connection.getBalance(new PublicKey(user.walletId));

    const mainButtons = createButtons();
    const walletEmbed = createWalletEmbed(user, solBalance, user.settings);

    // Send initial message
    await interaction.reply({
        content: `${user.walletId}`,
        embeds: [walletEmbed],
        components: [mainButtons],
        fetchReply: true
    });

    // Set up collector
    const filter = i => ['copy_address', 'settings', 'adjust_slippage', 'adjust_priorityFee'].includes(i.customId) && 
                       i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

    // Handle button clicks
    collector.on('collect', async (i: ButtonInteraction) => {
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
        }
    });
}

module.exports = { data, execute };

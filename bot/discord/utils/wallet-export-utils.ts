import { 
    ButtonInteraction, 
    ButtonBuilder, 
    ButtonStyle, 
    ActionRowBuilder, 
    MessageActionRowComponentBuilder,
    CommandInteraction
} from 'discord.js';
import bs58 from 'bs58';
import { UserType } from '../../types/user.types';
import { UserService } from '../../src/user/user.service';
import { User } from 'src/user/entities/user.entity';

export function createExportWalletButton() {
    return new ButtonBuilder()
        .setCustomId('export_wallet')
        .setLabel('Export Wallet')
        .setStyle(ButtonStyle.Primary);
}

export async function handleNewUserWelcome(
    interaction: CommandInteraction, 
    publicKey: string
) {
    try {
        // Create DM channel first
        const dmChannel = await interaction.user.createDM();

        // Send welcome message with export button in DM
        const row = new ActionRowBuilder<MessageActionRowComponentBuilder>()
            .addComponents(createExportWalletButton());

        await dmChannel.send({
            content: `🎉 Welcome to Avalanche! Your new wallet has been created.\n\nWallet Address: \`${publicKey}\`\n\nℹ️ You can export your wallet credentials now by clicking the button below. This is a one-time opportunity for security reasons.\n\n⚠️ IMPORTANT: Make sure to save your credentials in a secure location!`,
            components: [row]
        });

        // Reply in the original channel
        await interaction.reply({
            content: "I've sent you information on how to set this up in ypur DMs. Please check your Direct Messages.",
            ephemeral: true
        });
    } catch (error) {
        console.error('Error in handleNewUserWelcome:', error);
        await interaction.reply({
            content: "❌ Unable to send welcome message in DMs. Please enable DMs from server members and try again.",
            ephemeral: true
        });
    }
}

export async function handleExportWallet(
    interaction: ButtonInteraction,
    user: User,
    userService: UserService
) {
    try {
        // Create DM channel first to check if we can message the user
        const dmChannel = await interaction.user.createDM();
        
        // Decode the private key from base58
        const privateKey = bs58.decode(user.encryptedPrivateKey);
        
        // Send wallet details via DM
        const credentialsMessage = await dmChannel.send({
            content: `🔐 **Your Wallet Credentials**\n\n` +
                    `Public Key (Address): \`${user.walletId}\`\n` +
                    `Private Key: \`${bs58.encode(privateKey)}\`\n\n` +
                    `⚠️ **IMPORTANT SECURITY WARNINGS**:\n` +
                    `• Never share your private key with anyone\n` +
                    `• Store these credentials in a secure location\n` +
                    `• Anyone with access to your private key can control your wallet\n` +
                    `• This message will not be available again for security reasons\n` + 
                    `• You have only 5 mins to store the private key before its deleted from the message history`
        });

        // Update the original interaction to remove the export button
        await interaction.update({
            content: '⚠️ Remember to save your keys in a secure location!',
            components: [] // Remove the export button after use
        });

        setTimeout(async () => {
            try {
                await credentialsMessage.delete();
                await dmChannel.send("🔒 Previous credentials message has been deleted for security.");
            } catch (error) {
                console.error('Error deleting credentials message:', error);
            }
        }, 5 * 60 * 1000); 

    } catch (error) {
        console.error('Error in handleExportWallet:', error);
        
        // Check if the error is related to DM permissions
        if (error.code === 50007) {
            await interaction.reply({
                content: '❌ Unable to send wallet credentials. Please enable DMs from server members and try again.',
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: '❌ An error occurred while exporting your wallet. Please try again or contact support.',
                ephemeral: true
            });
        }
    }
}
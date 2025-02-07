import { 
    SlashCommandBuilder, 
    ChatInputCommandInteraction,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder
} from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('start')
    .setDescription('Start interacting with the Avalanche in DMs');

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.isRepliable()) return;

    try {
        // Immediately acknowledge the interaction
        await interaction.deferReply({ ephemeral: true });

        // Create DM channel first
        const dmChannel = await interaction.user.createDM();
        
        // Send DM first
        const dmEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Welcome to the Bot!')
            .setDescription('You can now interact with me directly in this DM channel.')
            .addFields(
                { 
                    name: 'Available Commands', 
                    value: 'Here are some commands to get started:\n• `/buy_token` - View and buy tokens\n• `/sell_token` - View and sell your tokens'
                }
            );

        await dmChannel.send({
            embeds: [dmEmbed]
        });

        // Create button and embed for original channel
        const dmButton = new ButtonBuilder()
            .setLabel('Message Me')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/users/${interaction.client.user?.id}`);

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(dmButton);

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Let\'s chat in private!')
            .setDescription('I\'ve sent you a DM! Check your Direct Messages.');

        // Edit the deferred reply
        await interaction.editReply({
            embeds: [embed],
            components: [row]
        });
        
    } catch (error) {
        console.error('Error:', error);
        
        try {
            if (interaction.deferred) {
                await interaction.editReply({
                    content: 'I couldn\'t send you a DM! Please make sure you have DMs enabled for this server.'
                });
            } else {
                await interaction.reply({
                    content: 'I couldn\'t send you a DM! Please make sure you have DMs enabled for this server.',
                    ephemeral: true
                });
            }
        } catch (e) {
            console.error('Failed to send error message:', e);
        }
    }
}
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
    .setDescription('Start interacting with the bot in DMs');

export async function execute(interaction: ChatInputCommandInteraction) {
    try {
        // Create a button that links to the bot's DM
        const dmButton = new ButtonBuilder()
            .setLabel('Message Me')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/users/${interaction.client.user.id}`);

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(dmButton);

        // Create an embed for the response
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Let\'s chat in private!')
            .setDescription('Click the button below to start a conversation with me in DMs.')
            .setTimestamp();

        // Send the initial response in the channel
        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true // Makes the message only visible to the command user
        });

        // Try to send a DM to the user
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Welcome to the Bot!')
                .setDescription('You can now interact with me directly in this DM channel.')
                .addFields(
                    { 
                        name: 'Available Commands', 
                        value: 'Here are some commands to get started:\n• `/buy_token` - View and buy tokens\n• `/sell_token` - View and sell your tokens\n•' 
                    }
                )
                .setTimestamp();

            await interaction.user.send({
                embeds: [dmEmbed]
            });
        } catch (error) {
            // If we can't send a DM, inform the user
            await interaction.followUp({
                content: 'I couldn\'t send you a DM! Please make sure you have DMs enabled for this server.',
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Error in start command:', error);
        await interaction.reply({
            content: 'There was an error while executing this command.',
            ephemeral: true
        });
    }
}
// dmButtonHandler.ts

import { 
    Message, 
    ButtonInteraction, 
    ActionRowBuilder, 
    ButtonBuilder,
    MessageCreateOptions,
    TextChannel,
    DMChannel,
    NewsChannel,
    ThreadChannel,
    MessageComponentInteraction,
    CollectorFilter
} from 'discord.js';
import { UserType } from '../../types/user.types';
import { UserService } from '../../src/user/user.service';

interface ButtonHandlers {
    [key: string]: (interaction: ButtonInteraction, user: UserType, userService: UserService) => Promise<void>;
}

interface CreateDMResponseOptions {
    message: Message;
    content: string;
    embeds?: any[];
    components: ActionRowBuilder<ButtonBuilder>[];
    user: UserType;
    userService: UserService;
    buttonHandlers: ButtonHandlers;
    collectorTimeout?: number;
}

export async function createDMResponseWithButtons({
    message,
    content,
    embeds = [],
    components,
    user,
    userService,
    buttonHandlers,
    collectorTimeout = 300000 // 5 minutes default
}: CreateDMResponseOptions) {
    try {
        // Send initial response
        const reply = await message.reply({
            content,
            embeds,
            components
        });

        // Type guard to check if channel supports collectors
        const channel = message.channel;
        if (!('createMessageComponentCollector' in channel)) {
            console.error('Channel does not support collectors');
            return reply;
        }

        // Create collector with properly typed filter
        const filter: CollectorFilter<[MessageComponentInteraction]> = (interaction) => {
            return interaction.isButton() && interaction.user.id === user.discordId;
        };

        const collector = channel.createMessageComponentCollector({ 
            filter,
            time: collectorTimeout
        });

        // Handle button clicks
        collector.on('collect', async (interaction: MessageComponentInteraction) => {
            // Ensure we're dealing with a button interaction
            if (!interaction.isButton()) return;

            try {
                const handler = buttonHandlers[interaction.customId];
                if (handler) {
                    await handler(interaction, user, userService);
                } else {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ Unknown button interaction',
                            ephemeral: true
                        });
                    }
                }
            } catch (error) {
                console.error('Error handling button interaction:', error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ An error occurred while processing your request.',
                        ephemeral: true
                    });
                }
            }
        });

        // Handle collector end
        collector.on('end', async () => {
            if (reply instanceof Message) {
                const disabledComponents = components.map(row => {
                    const newRow = new ActionRowBuilder<ButtonBuilder>();
                    newRow.addComponents(
                        row.components.map(button => 
                            ButtonBuilder.from(button).setDisabled(true)
                        )
                    );
                    return newRow;
                });
                
                await reply.edit({ components: disabledComponents });
            }
        });
        return reply;
    } catch (error) {
        console.error('Error in createDMResponseWithButtons:', error);
        throw error;
    }
}
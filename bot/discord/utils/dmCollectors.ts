import { 
    User, 
    DMChannel, 
    Message, 
    MessageCollector, 
    CommandInteraction,
    MessageComponentInteraction,
    CacheType,
    ButtonInteraction,
    SelectMenuInteraction,
    InteractionResponse
} from 'discord.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { UserRepository } from '../../service/user.repository';

interface DMCollectorOptions {
    prompt: string;
    timeout?: number;
    maxAttempts?: number;
    validator?: (content: string) => { 
        isValid: boolean; 
        value?: any;
        error?: string; 
    };
    onSuccess?: (message: Message, value: any) => Promise<void>;
    onError?: (message: Message, error: string) => Promise<void>;
    onTimeout?: (dmChannel: DMChannel) => Promise<void>;
}

export class DMCollectorService {
    private static readonly DEFAULT_TIMEOUT = 60000; 
    private static readonly DEFAULT_MAX_ATTEMPTS = 1;

    static async collectDM(
        interaction: ButtonInteraction | SelectMenuInteraction | CommandInteraction,
        options: DMCollectorOptions
    ): Promise<void> {
        try {
            let interactionResponse: InteractionResponse | Message;

            // Handle different interaction types
            if (interaction instanceof ButtonInteraction || interaction instanceof SelectMenuInteraction) {
                interactionResponse = await interaction.deferUpdate();
            } else {
                interactionResponse = await interaction.deferReply({ ephemeral: true });
            }

            const dmChannel = await interaction.user.createDM();
            await dmChannel.send(options.prompt);
            
            let attempts = 0;
            const maxAttempts = options.maxAttempts || this.DEFAULT_MAX_ATTEMPTS;
            
            while (attempts < maxAttempts) {
                try {
                    const response = await this.createCollector(
                        dmChannel, 
                        interaction.user,
                        options
                    );
                    
                    if (response.success) {
                        if (interaction instanceof CommandInteraction) {
                            await interaction.editReply({ content: '✅ Settings updated successfully!' });
                        }
                        return;
                    }
                    
                    attempts++;
                    if (attempts < maxAttempts) {
                        await dmChannel.send(`Please try again. ${response.error}`);
                    }
                } catch (error) {
                    console.error('Error in DM collection attempt:', error);
                    throw error;
                }
            }
            
            await dmChannel.send('Maximum attempts reached. Please try the command again.');
            
        } catch (error) {
            console.error('Error in collectDM:', error);
            const errorMessage = { 
                content: '❌ Error processing your request', 
                ephemeral: true 
            };

            if (!interaction.replied) {
                if (interaction instanceof ButtonInteraction || interaction instanceof SelectMenuInteraction) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.editReply(errorMessage);
                }
            }
        }
    }

    private static async createCollector(
        dmChannel: DMChannel,
        user: User,
        options: DMCollectorOptions
    ): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            const collector = dmChannel.createMessageCollector({
                filter: m => m.author.id === user.id && !m.author.bot,
                time: options.timeout || this.DEFAULT_TIMEOUT,
                max: 1
            });

            collector.on('collect', async (message) => {
                try {
                    if (options.validator) {
                        const validationResult = options.validator(message.content);
                        if (!validationResult.isValid) {
                            if (options.onError) {
                                await options.onError(message, validationResult.error || 'Invalid input');
                            } else {
                                await message.reply(validationResult.error || 'Invalid input');
                            }
                            resolve({ success: false, error: validationResult.error });
                            return;
                        }

                        if (options.onSuccess) {
                            await options.onSuccess(message, validationResult.value);
                        }
                    }

                    resolve({ success: true });
                } catch (error) {
                    console.error('Error processing collected message:', error);
                    resolve({ success: false, error: 'An error occurred processing your input' });
                }
            });

            collector.on('end', async collected => {
                if (collected.size === 0) {
                    if (options.onTimeout) {
                        await options.onTimeout(dmChannel);
                    } else {
                        await dmChannel.send('Time expired. Please try again.');
                    }
                    resolve({ success: false, error: 'Timeout' });
                }
            });
        });
    }
}

export const Validators = {
    buyPrice: (content: string) => {
        const price = parseFloat(content);
        return {
            isValid: !isNaN(price) && price > 0,
            value: price,
            error: 'Please enter a valid number greater than 0'
        };
    },
    
    solAmount: (content: string) => {
        const amount = parseFloat(content);
        return {
            isValid: !isNaN(amount) && amount > 0 && amount <= 100,
            value: amount,
            error: 'Please enter a valid SOL amount between 0 and 100'
        };
    },

    percentage: (content: string) => {
        const percent = parseFloat(content);
        return {
            isValid: !isNaN(percent) && percent >= 0 && percent <= 100,
            value: percent,
            error: 'Please enter a valid percentage between 0 and 100'
        };
    }
};
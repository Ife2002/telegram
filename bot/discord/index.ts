import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, Collection, EmbedBuilder, Events, GatewayIntentBits, Message } from 'discord.js';
import { deployCommands } from './deploy-commands';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { data as tokenCommand, execute as tokenExecute, handleBuyNow, pumpService } from './commands/token/buy';
import { UserRepository } from '../service/user.repository';
import { getTokenInfo } from '../logic/utils/getTokenInfo';


// Extend the Client class to include commands
export class AvalancheDiscordClient extends Client {
    commands: Collection<string, any>;
    
    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages, 
                GatewayIntentBits.DirectMessageReactions, 
                GatewayIntentBits.DirectMessageTyping 
            ]
        });
        this.commands = new Collection();
    }
}

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

// Create a new client instance using our extended class
const client = new AvalancheDiscordClient();

// Load commands
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}


// When the client is ready, run this code (only once)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        
        const { user } = await UserRepository.getOrCreateUserForDiscord(
            interaction.user.id, 
            interaction
        );
        
        await command.execute(interaction, user);
    } catch (error) {
        console.error('Error:', error);
        if (!interaction.replied) {
            await interaction.reply({ 
                content: 'An error occurred', 
                ephemeral: true 
            });
        }
    }
});

// Handle DMs
client.on(Events.MessageCreate, async message => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Handle DM messages
    if (message.channel.type === ChannelType.DM) {
        // Example command handling
        const args = message.content.trim().split(/ +/);
        const command = args.shift()?.toLowerCase();

        if (command === '!token') {
            const tokenAddress = args[0];
            if (!tokenAddress) {
                await message.reply('Please provide a token address!');
                return;
            }

            try {
                // Use your existing token command logic
                const tokenInfo = await getTokenInfo(pumpService, tokenAddress);
                
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

                const buyButton = new ButtonBuilder()
                    .setCustomId(`buyNow_${tokenAddress}`)
                    .setLabel('Buy Now')
                    .setStyle(ButtonStyle.Primary);

                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(buyButton);

                await message.reply({
                    embeds: [embed],
                    components: [row]
                });
            } catch (error) {
                console.error('Error:', error);
                await message.reply('Error fetching token information!');
            }
        }

        // Add help command
        if (command === '!help') {
            const helpEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Bot Commands')
                .setDescription('Here are the available commands:')
                .addFields(
                    { name: '!token <address>', value: 'Get information about a token' },
                    { name: '!help', value: 'Show this help message' }
                    // Add more commands as needed
                );

            await message.reply({ embeds: [helpEmbed] });
        }
    }
});


client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log('Successfully logged in to Discord!');
        return deployCommands();
    })
    .then(() => {
        console.log('Commands deployed successfully!');
    })
    .catch(error => {
        console.error('Error:', error);
    });
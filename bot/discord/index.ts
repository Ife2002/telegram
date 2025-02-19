import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, Collection, EmbedBuilder, Events, GatewayIntentBits, Message, Partials } from 'discord.js';
import { deployCommands } from './deploy-commands';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { handleBuyNow, pumpService } from './commands/token/buy';
import { UserService } from '../src/user/user.service';
import { getTokenInfo } from '../logic/utils/astralane';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { createLookupComponent, handleRefresh } from './components/lookUp';
import { TokenMarketData } from '../logic/utils/types';
import { DataSource } from 'typeorm';
import { User } from '../src/user/entities/user.entity';
import { UserSettings } from '../src/user/entities/user-settings.entity';
import { UserBuddy } from '../src/user/entities/user-buddy.entity';
import { handleExportWallet, handleNewUserWelcome } from './utils/wallet-export-utils';

const AppDataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [User, UserSettings, UserBuddy],
    synchronize: false, // Set this to false to prevent automatic schema updates
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    logging: false
});

const userActiveTokenAddresses = new Map<string, string>();

export const initializeServices = async () => {
    try {
        console.log('Connecting to database...');
        
        await AppDataSource.initialize();
        console.log("Data Source has been initialized!");

        // Optionally run migrations if needed
        // await AppDataSource.runMigrations();
        
        const userService = new UserService(
            AppDataSource.getRepository(User),
            AppDataSource.getRepository(UserSettings),
            AppDataSource.getRepository(UserBuddy)
        );

        return userService;
    } catch (error) {
        console.error("Error during Data Source initialization:", error);
        throw error;
    }
};

export class AvalancheDiscordClient extends Client {
    commands: Collection<string, any>;
    userService: UserService;
    
    constructor(userService: UserService) {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.DirectMessageTyping,
                GatewayIntentBits.GuildMessageReactions,
                GatewayIntentBits.DirectMessageReactions,
                GatewayIntentBits.DirectMessageReactions,
                GatewayIntentBits.GuildPresences,
            ],
            partials: [Partials.Channel, Partials.Message, Partials.User]
        });
        this.commands = new Collection();
        this.userService = userService;
    }
}

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Initialize bot with services
async function startBot() {
    try {
        const userService = await initializeServices();
        const client = new AvalancheDiscordClient(userService);

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

        // Rest of your event handlers
        client.on(Events.InteractionCreate, async interaction => {
            if (!interaction.isChatInputCommand() && !interaction.isButton()) return;
        
            try {

                // Command handling
                if (interaction.isChatInputCommand()) {
                    const command = client.commands.get(interaction.commandName);
                    if (!command) return;
        
                    // If it's not the start command and not in DMs, redirect to DMs
                    if (interaction.commandName !== 'start' && !interaction.channel?.isDMBased()) {
                        await interaction.reply({
                            content: 'This command can only be used in DMs for security reasons. Please use it there instead.',
                            ephemeral: true
                        });
                        return;
                    }
        
                    const { user, isNew, publicKey } = await client.userService.getOrCreateUserForDiscord(
                        interaction.user.id,
                        interaction
                    );
        
                    if (isNew) {
                        await handleNewUserWelcome(interaction, publicKey);
                        return;
                    }
        
                    await command.execute(interaction, user);
                }

                // Handle button interactions
                if (interaction.isButton()) {
                    if (interaction.customId === 'export_wallet') {
                        // Check if not in DM
                        if (!interaction.channel?.isDMBased()) {
                            await interaction.reply({
                                content: 'This button only works in DMs. Please use it there instead.',
                                ephemeral: true
                            });
                            return;
                        }
        
                        const { user } = await client.userService.getOrCreateUserForDiscord(
                            interaction.user.id,
                            interaction
                        );
                        await handleExportWallet(interaction, user, client.userService);
                        return;
                    }
                }
        
                
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

        // Your button interaction handler
       client.on(Events.InteractionCreate, async interaction => {

            const userService = (interaction.client as AvalancheDiscordClient).userService;
            if (!interaction.isButton()) return;

                try {
                    const [action, address] = interaction.customId.split('_');

                    console.log(action, address);

                    const { user } = await userService.getOrCreateUserForDiscord(
                        interaction.user.id,
                        interaction
                    );

                    const buyPriceFromConfig = await userService.getBuyAmount(interaction.user.id);

                    // Fetch tokenInfo first for all cases that need it
                    let tokenInfo: TokenMarketData;
                    if (['buyNow', 'buy1', 'buy10', 'refresh', 'setBuyPrice'].includes(action)) {
                        const tokenAddress = action === 'setBuyPrice' 
                            ? userActiveTokenAddresses.get(interaction.user.id)  // Get from map for setBuyPrice
                            : address;  // Use direct address for other actions

                        if (!tokenAddress) {
                            await interaction.reply({
                                content: 'Please look up a token first.',
                                ephemeral: true
                            });
                            return;
                        }

                        tokenInfo = await getTokenInfo(tokenAddress);
                    }

                    switch (action) {
                        case 'buyNow':
                            await handleBuyNow(
                                interaction, 
                                userService,
                                tokenInfo,
                                user,
                                buyPriceFromConfig
                            );
                            console.log(`buying ${tokenInfo?.tokenAddress} for ${interaction.user.username} now`)
                            break;
                        case 'setBuyPrice':
                            try {

                                await interaction.deferUpdate();
                        
                                // Send DM to user
                                const dmChannel = await interaction.user.createDM();
                                await dmChannel.send("Please enter your desired buy price in SOL (e.g., 0.1)");

                                // Create a message collector for the DM
                                const collector = dmChannel.createMessageCollector({ 
                                    filter: m => !m.author.bot,
                                    time: 60000, // 1 minute timeout
                                    max: 1 
                                });
                        
                                collector.on('collect', async (message) => {
                                    const buyPrice = parseFloat(message.content);
                        
                                    // Validate the input
                                    if (isNaN(buyPrice) || buyPrice <= 0) {
                                        await message.reply('Invalid input. Please enter a valid number greater than 0. Try setting the buy price again.');
                                        return;
                                    }
                        
                                    try {
                                        // Save the buy price
                                        await userService.setUserSetting(interaction.user.id, 'buyAmount', buyPrice);
                                        const { publicKey } = await userService.getOrCreateUserForDiscord(
                                            message.author.id,
                                            message.channelId
                                        );
                                        
                                        const connection = new Connection(process.env.HELIUS_RPC_URL);
                                        const solBalance = await connection.getBalance(new PublicKey(publicKey));

                                        const lookupCard = createLookupComponent({
                                            tokenInfo,
                                            content: message.content,
                                            solBalance,
                                            buyPriceFromConfig,
                                            userService
                                        });


                                        try {
                                            await message.reply({
                                                embeds: [lookupCard.embed],
                                                components: lookupCard.components
                                            });
                                        } catch (error) {
                                            console.error('Failed to reply:', error);
                                            await message.reply({
                                                embeds: [lookupCard.embed],
                                                components: lookupCard.components
                                            });
                                        }
                                    } catch (error) {
                                        console.error('Error saving buy price:', error);
                                        await message.reply('❌ Failed to save buy price. Please try again.');
                                    }
                                });
                        
                                collector.on('end', collected => {
                                    if (collected.size === 0) {
                                        interaction.user.send('Time expired. Please try setting the buy price again.');
                                    }
                                });
                        
                } catch (error) {
                    console.error('Error in setBuyPrice:', error);
                    if (!interaction.replied) {
                        await interaction.reply({
                            content: '❌ Error processing your request',
                            ephemeral: true
                        });
                    }
                }
                break;
            case 'buy1': 
                console.log("buy 1")
                await handleBuyNow(
                    interaction, 
                    userService,
                    tokenInfo,
                    user,
                    1
                );
                console.log(`buying ${tokenInfo?.tokenAddress} for ${interaction.user.username} now`)
            break;
            case 'buy10': 
                await handleBuyNow(
                    interaction, 
                    userService,
                    tokenInfo,
                    user,
                    0.1
                );
                console.log(`buying ${tokenInfo.tokenAddress} for ${interaction.user.username} now`)
            break;

            case 'refresh': 
                 
                await handleRefresh(
                    interaction, 
                    address,
                    tokenInfo,
                    userService
                );
                console.log(`Refreshing ${tokenInfo.tokenAddress} for ${interaction.user.username} now`)
            break;

            }
    } catch (error) {
        console.error('Button interaction error:', error);
        if (!interaction.replied) {
            await interaction.reply({ 
                content: '❌ Error processing your request', 
                ephemeral: true 
            });
        }
    }
       });

        // Your message handler
    client.on(Events.MessageCreate, async message => {
            if (!message.channel.isDMBased()) return;
            if (message.author.bot) return;

            const content = message.content.trim();
            
            if (content.length >= 32 && content.length <= 44) {
                try {
                    new PublicKey(content);

                    // Store address in map if it's provided (all actions except setBuyPrice)
                    if (content.length >= 32 && content.length <= 44) {
                        userActiveTokenAddresses.set(message.author.id, content);
                    }
                    
                    const tokenInfo = await getTokenInfo(content);

                    const { publicKey } = await client.userService.getOrCreateUserForDiscord(
                        message.author.id,
                        message
                    );
                    
                    const connection = new Connection(process.env.HELIUS_RPC_URL);
                    const solBalance = await connection.getBalance(new PublicKey(publicKey));
                    const buyPriceFromConfig = await client.userService.getBuyAmount(message.author.id);

                    const lookupCard = createLookupComponent({
                        tokenInfo,
                        content,
                        solBalance,
                        buyPriceFromConfig,
                        userService
                    });
                     
                    try {
                        await message.reply({
                            embeds: [lookupCard.embed],
                            components: lookupCard.components
                        });
                    } catch (error) {
                        console.error('Failed to reply:', error);
                        await message.channel.send({
                            embeds: [lookupCard.embed],
                            components: lookupCard.components
                        });
                    }
                    
                } catch (error) {
                    console.error('Error:', error);
                    await message.reply('❌ Error fetching token information');
                }
            }
        });

        // Login and deploy commands
        await client.login(process.env.DISCORD_TOKEN);
        console.log('Successfully logged in to Discord!');
        await deployCommands();
        console.log('Commands deployed successfully!');

    } catch (error) {
        console.error('Failed to start bot:', error);
        process.exit(1);
    }
}

// Start the bot
startBot();
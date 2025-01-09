import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, Collection, EmbedBuilder, Events, GatewayIntentBits, Message, Partials } from 'discord.js';
import { deployCommands } from './deploy-commands';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { data as tokenCommand, execute as tokenExecute, handleBuyNow, pumpService } from './commands/token/buy';
import { UserRepository } from '../service/user.repository';
import { getTokenInfo } from '../logic/utils/getTokenInfo';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';


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
                GatewayIntentBits.DirectMessageTyping,
                GatewayIntentBits.GuildMessageReactions,
                GatewayIntentBits.DirectMessageReactions,
                GatewayIntentBits.DirectMessageReactions,
                GatewayIntentBits.GuildPresences,
            ],
            partials: [Partials.Channel, Partials.Message, Partials.User]
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


// Handle slash commands
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

// client.on('ready', () => {
//     console.log(`Logged in as ${client.user.tag}!`);
//     console.log('Enabled intents:', client.options.intents);
// });


client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    try {
        const [action, address] = interaction.customId.split('_');

        const { user } = await UserRepository.getOrCreateUserForDiscord(
            interaction.user.id,
            interaction
        );

        const buyPriceFromConfig = await UserRepository.getBuyAmount(interaction.user.id);

        switch (action) {
            case 'buyNow':
                // Get token info first
                const tokenInfo = await getTokenInfo(pumpService, address);
                await handleBuyNow(
                    interaction, 
                    tokenInfo,
                    user,
                    buyPriceFromConfig
                );
                console.log(`buying ${tokenInfo.tokenAddress} for ${interaction.user.username} now`)
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
                            await UserRepository.setUserSetting(interaction.user.id, 'buyAmount', buyPrice);
                            await message.reply(`✅ Successfully set buy price to ${buyPrice} SOL`);
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


// Handle messages (both DM and server)
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    const content = message.content.trim();
    
    if (content.length >= 32 && content.length <= 44) {

        try {
            // Validate it's a real public key
            new PublicKey(content);
            
            const tokenInfo = await getTokenInfo(pumpService, content);
            const { publicKey } = await UserRepository.getOrCreateUserForDiscord(
                message.author.id,
                message.channelId
            );
            
            const connection = new Connection(process.env.HELIUS_RPC_URL);
            const solBalance = await connection.getBalance(new PublicKey(publicKey));
            const buyPriceFromConfig = await UserRepository.getBuyAmount(message.author.id);

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`🪙 BUY ${tokenInfo.symbol.toUpperCase()} -- (${tokenInfo.name})`)
                .setDescription(`\`${content}\``)
                .addFields(
                    { name: 'Balance', value: `${solBalance / LAMPORTS_PER_SOL} SOL`, inline: true },
                    { name: 'Price', value: `$${tokenInfo.price}`, inline: true },
                    { name: 'Market Cap', value: `$${tokenInfo.mCap.toFixed(2)}`, inline: true }
                );

            const row1 = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`buyNow_${content}`)
                        .setLabel('🛒 Buy Now')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`buy_${content}`)
                        .setLabel('⚡️ Buy At')
                        .setStyle(ButtonStyle.Primary)
                );

            const row2 = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('setBuyPrice')
                        .setLabel(`Set Buy Price - ${buyPriceFromConfig || '0'} SOL`)
                        .setStyle(ButtonStyle.Secondary)
                );

                try {
                    await message.reply({
                        embeds: [embed],
                        components: [row1, row2]
                    });
                } catch (error) {
                    console.error('Failed to reply:', error);
                    // Attempt to send as a new message if reply fails
                    await message.channel.send({
                        embeds: [embed],
                        components: [row1, row2]
                    });
                }
        } catch (error) {
            console.error('Error:', error);
            await message.reply('❌ Error fetching token information');
        }
    }
});

// Add this right before your login code:


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
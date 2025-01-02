import { Client, Collection, Events, GatewayIntentBits, Message } from 'discord.js';
import { deployCommands } from './deploy-commands';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { data as tokenCommand, execute as tokenExecute, handleBuyNow } from './commands/token/buy';
import { UserRepository } from '../service/user.repository';


// Extend the Client class to include commands
export class AvalancheDiscordClient extends Client {
    commands: Collection<string, any>;
    
    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
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
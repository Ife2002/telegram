import { 
    SlashCommandBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ActionRowBuilder,
    ComponentType,
    ChatInputCommandInteraction,
    ButtonInteraction,
    EmbedBuilder,
    Message,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ModalActionRowComponentBuilder
} from 'discord.js';
import { PumpFunSDK } from "pumpdotfun-sdk";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { AnchorProvider } from '@coral-xyz/anchor';
import { UserType } from 'types/user.types';
import axios from 'axios';
import { getTokenPrice } from '../../../logic/utils/getPrice';
import { UserRepository } from '../../../service/user.repository';
import { DiscordAdapter } from '../../../lib/utils';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import { toBigIntPrecise } from '../../../logic/utils';
import { getSmartMint } from '../../../logic/utils/getSmartMint';
import { sell as raydiumSell } from "../../../raydium-sdk"


interface TokenFile {
    uri: string;
    cdn_uri: string;
    mime: string;
}

interface TokenMetadata {
    description: string;
    name: string;
    symbol: string;
    token_standard: string;
}

interface TokenLinks {
    image: string;
}

interface TokenContent {
    $schema: string;
    json_uri: string;
    files: TokenFile[];
    metadata: TokenMetadata;
    links: TokenLinks;
}

interface TokenAuthority {
    address: string;
    scopes: string[];
}

interface TokenCompression {
    eligible: boolean;
    compressed: boolean;
    data_hash: string;
    creator_hash: string;
    asset_hash: string;
    tree: string;
    seq: number;
    leaf_id: number;
}

interface TokenRoyalty {
    royalty_model: string;
    target: null;
    percent: number;
    basis_points: number;
    primary_sale_happened: boolean;
    locked: boolean;
}

interface TokenOwnership {
    frozen: boolean;
    delegated: boolean;
    delegate: null;
    ownership_model: string;
    owner: string;
}

interface TokenInfo {
    balance: number;
    supply: number;
    decimals: number;
    token_program: string;
    associated_token_address: string;
}

interface TokenItem {
    interface: string;
    id: string;
    content: TokenContent;
    authorities: TokenAuthority[];
    compression: TokenCompression;
    grouping: any[];
    royalty: TokenRoyalty;
    creators: any[];
    ownership: TokenOwnership;
    supply: null;
    mutable: boolean;
    burnt: boolean;
    token_info: TokenInfo;
}

interface TokenResponse {
    total: number;
    limit: number;
    page: number;
    items: TokenItem[];
}

interface ActiveToken {
    id: string;
    balance: number;
    tokenData: TokenItem;
}

let wallet = new NodeWallet(Keypair.generate());

const connection = new Connection(process.env.HELIUS_RPC_URL);
                
const provider = new AnchorProvider(connection, wallet, {
      commitment: "finalized",
      });
            

export const pumpService = new PumpFunSDK(provider);

const SLIPPAGE_BASIS_POINTS = 3000n;

const activeTokens = new Map<string, ActiveToken>();

export const data = new SlashCommandBuilder()
    .setName('trade')
    .setDescription('View and sell your tokens');

        export async function execute(interaction: ChatInputCommandInteraction, user: UserType) {
            try {
                // Get user's wallet tokens
                const walletId = user.walletId; // Adjust based on your user type
                const getTokensByOwnerUrl = `https://narrative-server-production.up.railway.app/das/fungible/${walletId}`;
                const getTokensByOwner = await axios.get<TokenResponse>(getTokensByOwnerUrl);
                const OwnerTokensInfo = getTokensByOwner.data;
        
                // Create embed for tokens list
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Your Tokens')
                    .setTimestamp();
        
                // Add fields for each token
                for (const token of OwnerTokensInfo.items) {
                    const balance = token.token_info?.balance / Math.pow(10, token.token_info?.decimals);
                    const price = await getTokenPrice(token.id);
                    const totalValue = balance * price;

                    console.log(totalValue)
        
                    embed.addFields({
                        name: token.content.metadata.name,
                        value: `Address: \`${token?.id}\`\nBalance: ${balance?.toLocaleString()} ${token.content.metadata.symbol}\nPrice: $${price} \nTotal Value: $${totalValue}`,
                        inline: false
                    });
                }
        
                // Create select token buttons
                const rows: ActionRowBuilder<ButtonBuilder>[] = [];
                let currentRow = new ActionRowBuilder<ButtonBuilder>();
                
                for (const token of OwnerTokensInfo.items) {
                    const selectButton = new ButtonBuilder()
                        .setCustomId(`select_token:${token.id}`)
                        .setLabel(`Select ${token.content.metadata.name}`)
                        .setStyle(ButtonStyle.Secondary);
        
                    if (currentRow.components.length === 5) {
                        rows.push(currentRow);
                        currentRow = new ActionRowBuilder<ButtonBuilder>();
                    }
                    currentRow.addComponents(selectButton);
                }
                
                if (currentRow.components.length > 0) {
                    rows.push(currentRow);
                }
        
                // Send initial message
                const response = await interaction.reply({
                    embeds: [embed],
                    components: rows,
                    fetchReply: true
                });
        
                // Create collector for button interactions
                const collector = response.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 3_600_000 // 1 hour
                });
        
                collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
                    // Verify that the user who clicked is the one who initiated
                    if (buttonInteraction.user.id !== interaction.user.id) {
                        await buttonInteraction.reply({
                            content: 'This button is not for you!',
                            ephemeral: true
                        });
                        return;
                    }
        
                    const [action, value] = buttonInteraction.customId.split(':');
        
                    if (action === 'select_token') {
                        const token = OwnerTokensInfo.items.find(t => t.id === value);
                        const balance = token.token_info.balance / Math.pow(10, token.token_info.decimals);
        
                        activeTokens.set(interaction.channelId, {
                            id: token.id,
                            balance: balance,
                            tokenData: token
                        });
        
                        // Create sell percentage buttons
                        const sellRow = new ActionRowBuilder<ButtonBuilder>()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('sell:25')
                                    .setLabel('Sell 25%')
                                    .setStyle(ButtonStyle.Primary),
                                new ButtonBuilder()
                                    .setCustomId('sell:50')
                                    .setLabel('Sell 50%')
                                    .setStyle(ButtonStyle.Primary),
                                new ButtonBuilder()
                                    .setCustomId('sell:75')
                                    .setLabel('Sell 75%')
                                    .setStyle(ButtonStyle.Primary),
                                new ButtonBuilder()
                                    .setCustomId('sell:100')
                                    .setLabel('Sell 100%')
                                    .setStyle(ButtonStyle.Danger)
                            );
        
                        // Update message with sell buttons
                        await buttonInteraction.update({
                            components: [...rows, sellRow]
                        });
                    }
        
                    if (action === 'sell') {
                        const activeToken = activeTokens.get(interaction.channelId);
                        if (!activeToken) {
                            await buttonInteraction.reply({
                                content: 'Please select a token first',
                                ephemeral: true
                            });
                            return;
                        }
        
                        const percentage = parseInt(value);
                        await buttonInteraction.deferReply({ ephemeral: true });


                        
        
                        try {

                            // Calculate amount based on percentage of user's balance
                            const balanceToSell = (activeToken.balance * percentage) / 100;


                            // Get encrypted private key from your database
                            const encryptedPrivateKey = await UserRepository.findByDiscordId(user.discordId);
                            if (!encryptedPrivateKey) {
                                throw new Error('User wallet not found');
                            }
                    
                            // Create Discord platform adapter
                            const discordPlatform = new DiscordAdapter(buttonInteraction);
                    
                            // Create keypair from encrypted private key
                            const userWallet = Keypair.fromSecretKey(bs58.decode(user.encryptedPrivateKey));
                    
                            // Calculate sell amount in lamports
                            const sellAmountBN = toBigIntPrecise(balanceToSell);
                    
                            // Get bonding curve account
                            const account = await pumpService.getBondingCurveAccount(new PublicKey(activeToken.id));
                            const { mintInfo } = await getSmartMint(connection, new PublicKey(activeToken.id));
                            
                            const shouldUsePump = account && !account.complete;
                    
                            if (shouldUsePump) {
                                await discordPlatform.sendMessage(interaction.channelId, "Executing Sell - (pre-bonding phase)...");
                                const tx = await pumpService.sell(
                                    discordPlatform,
                                    interaction.channelId,
                                    userWallet,
                                    new PublicKey(activeToken.id),
                                    sellAmountBN,
                                    SLIPPAGE_BASIS_POINTS,
                                    {
                                        unitLimit: 300000,
                                        unitPrice: 300000,
                                    }
                                );
                                return tx;
                            } else {
                                await discordPlatform.sendMessage(interaction.channelId, "Executing Sell - (post-bonding phase)...");
                                return await raydiumSell(
                                    discordPlatform,
                                    interaction.channelId,
                                    connection,
                                    activeToken.id,
                                    Number(sellAmountBN),
                                    userWallet
                                );
                            }
                        } catch (error) {
                            console.error('Sell transaction failed:', error);
                            
                            if (error instanceof Error) {
                                throw new Error(`Failed to execute sell: ${error.message}`);
                            } else {
                                throw new Error('Failed to execute sell: Unknown error occurred');
                            }
                        }
                    }
                });
        
                // Handle collector end
                collector.on('end', async () => {
                    try {
                        await interaction.editReply({
                            components: [] // Remove all buttons
                        });
                    } catch (error) {
                        console.error('Error removing buttons:', error);
                    }
                });
        
            } catch (error) {
                console.error('Error in sell command:', error);
                await interaction.reply({
                    content: 'There was an error executing this command.',
                    ephemeral: true
                });
            }
        }
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
import { getTokenInfo } from "../../../logic/utils/astralane";
import { getTokenPrice } from '../../../logic/utils/getPrice';
import { UserRepository } from '../../../service/user.repository';
import { DiscordAdapter } from '../../../lib/utils';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import { toBigIntPrecise } from '../../../logic/utils';
import { getSmartMint } from '../../../logic/utils/getSmartMint';
import { sell as raydiumSell } from "../../../raydium-sdk"
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import { createActionButtons } from './buy';
import { createLookupComponent } from '../../components/lookUp';
import { createSellCard } from '../../components/sellCard';


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
            const OwnerTokensInfo = await fetchUserTokens(interaction, user.walletId);
            const embed = await createTokenEmbed(OwnerTokensInfo.items);
            const rows = createTokenSelectionButtons(OwnerTokensInfo.items);
    
            const response = await interaction.reply({
                embeds: [embed],
                components: rows,
                fetchReply: true
            });
    
            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 3_600_000
            });
    
            collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.reply({
                        content: 'This button is not for you!',
                        ephemeral: true
                    });
                    return;
                }
    
                try {
                    const [action, value] = buttonInteraction.customId.split(':');
    
                    if (action === 'select_token') {
                        const token = OwnerTokensInfo.items.find(t => t.id === value);
                        await handleTokenSelection(buttonInteraction, token, rows, interaction.channelId, user.walletId, user.discordId);
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
    
                        await buttonInteraction.deferReply({ ephemeral: false });
                        await executeSellTransaction(activeToken, parseInt(value), user, buttonInteraction);
                    }
                } catch (error) {
                    console.error('Error handling button interaction:', error);
                    await buttonInteraction.followUp({
                        content: `Error processing your request: ${error.message}`,
                        ephemeral: true
                    });
                }
            });
    
            collector.on('end', async () => {
                try {
                    await interaction.editReply({
                        components: []
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


    async function updateUIAfterSell(
        interaction: ButtonInteraction,
        activeToken: ActiveToken,
        tokenAccount: PublicKey,
        mintInfo: any,
        percentage: number,
        signature: string,
        tokeninfo: any
    ): Promise<void> {
        const updatedInfo = await getAccount(connection, tokenAccount, "processed");
        const updatedBalance = Number(updatedInfo.amount) / Math.pow(10, mintInfo.decimals);

        if (updatedBalance > 0.000001) {
    
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`💰 SOLD ${activeToken.tokenData.content.metadata.symbol} -- (${activeToken.tokenData.content.metadata.name})`)
            .setDescription(`\`${activeToken.tokenData.id}\``)
            .addFields(
                { name: 'New Balance', value: `${updatedBalance} ${activeToken.tokenData.content.metadata.symbol}`, inline: true },
                { name: 'Amount Sold', value: `${activeToken.balance * (percentage / 100)} ${activeToken.tokenData.content.metadata.symbol}`, inline: true },
                { name: 'Sale %', value: `${percentage}%`, inline: true }
            )
            .addFields({
                name: 'Transaction',
                value: `[View on Solscan](https://solscan.io/tx/${signature})`,
                inline: false
            });
    
        const { row1, row2, row3 } = createActionButtons(tokeninfo, signature);
    
        await interaction.followUp({
            content: `✅ Successfully sold ${activeToken.tokenData.content.metadata.symbol}!`,
            embeds: [embed],
            components: [row1, row2, row3],
            ephemeral: false
        });
        } else {
            await interaction.followUp({
                content: `✅ Successfully sold all your ${activeToken.tokenData.content.metadata.symbol}!`,
                ephemeral: false
            });
        }
    }


    async function processTransactionConfirmation(
        signatures: string[],
        activeToken: ActiveToken,
        user: UserType,
        mintInfo: any,
        interaction: ButtonInteraction,
        percentage: number
    ): Promise<void> {
        if (signatures.length === 0) {
            throw new Error('No transaction signature received');
        }
    
        const lastSignature = signatures[signatures.length - 1];
        const confirmation = await connection.confirmTransaction(lastSignature, 'processed');
    
        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err}`);
        }
    
        const tokeninfo = await getTokenInfo(activeToken.id);
        const tokenAccount = await getAssociatedTokenAddress(
            new PublicKey(tokeninfo.tokenAddress),
            new PublicKey(user.walletId)
        );
    
        await updateUIAfterSell(
            interaction,
            activeToken,
            tokenAccount,
            mintInfo,
            percentage,
            lastSignature,
            tokeninfo
        );
    }


    async function executeRaydiumSell(
        platform: DiscordAdapter,
        interaction: ButtonInteraction,
        userWallet: Keypair,
        activeToken: ActiveToken,
        sellAmountBN: bigint
    ): Promise<string[]> {
        await platform.sendMessage(interaction.channelId, 
            `Executing Sell Order for ${activeToken?.tokenData?.content.metadata.name} on Raydium`);
    
        const result = await raydiumSell(
            platform,
            interaction.channelId,
            connection,
            activeToken.id,
            Number(sellAmountBN),
            userWallet
        );
    
        return result.signatures || [];
    }

    async function executePumpSell(
        platform: DiscordAdapter,
        user: UserType,
        interaction: ButtonInteraction,
        userWallet: Keypair,
        activeToken: ActiveToken,
        sellAmountBN: bigint
    ): Promise<string[]> {
        await platform.sendMessage(interaction.channelId, 
            `Executing Sell Order for ${activeToken?.tokenData?.content.metadata.name} on Pump`);

        // basically the nozomi tip
        const defaultPriorityFee = await UserRepository.getDefaultPriorityFee(user.discordId);    
    
        const result = await pumpService.sell(
            platform,
            interaction.channelId,
            userWallet,
            new PublicKey(activeToken.id),
            sellAmountBN,
            SLIPPAGE_BASIS_POINTS,
            defaultPriorityFee,
            {
                unitLimit: 300000,
                unitPrice: 300000,
            }
        );
    
        return result.signature ? [result.signature] : [];
    }

    async function executeSellTransaction(
        activeToken: ActiveToken,
        percentage: number,
        user: UserType,
        interaction: ButtonInteraction
    ): Promise<void> {
        const balanceToSell = (activeToken.balance * percentage) / 100;
        const discordPlatform = new DiscordAdapter(interaction);
        const userWallet = Keypair.fromSecretKey(bs58.decode(user.encryptedPrivateKey));
        const sellAmountBN = toBigIntPrecise(balanceToSell);
    
        const account = await pumpService.getBondingCurveAccount(new PublicKey(activeToken.id));
        const { mintInfo } = await getSmartMint(connection, new PublicKey(activeToken.id));
        const shouldUsePump = account && !account.complete;
    
        let signatures = await (shouldUsePump ? 
            executePumpSell(discordPlatform, user, interaction, userWallet, activeToken, sellAmountBN) :
            executeRaydiumSell(discordPlatform, interaction, userWallet, activeToken, sellAmountBN));
    
        await processTransactionConfirmation(signatures, activeToken, user, mintInfo, interaction, percentage);
    }

    async function handleTokenSelection(
        buttonInteraction: ButtonInteraction,
        token: TokenItem,
        rows: ActionRowBuilder<ButtonBuilder>[],
        channelId: string,
        userWallet: string,
        userId: string
    ): Promise<void> {
        const balance = token.token_info.balance / Math.pow(10, token.token_info.decimals);
    
        activeTokens.set(channelId, {
            id: token.id,
            balance: balance,
            tokenData: token
        });

        const tokenInfo = await getTokenInfo(token?.id);
                    
        const connection = new Connection(process.env.HELIUS_RPC_URL);
        const solBalance = await connection.getBalance(new PublicKey(userWallet));
        const buyPriceFromConfig = await UserRepository.getBuyAmount(userId);
    
        // content here refers to tokenAddress - tech debt
        const sellCard = await createSellCard({ tokenInfo, content: token?.id,  solBalance});
       // impl th e sell button in the same function
        const sellButtons = createSellButtons()

        await buttonInteraction.update({
            embeds: [sellCard.embed],
            components: [sellButtons]
        });
    }

    function createSellButtons(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>()
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
    }

    function createTokenSelectionButtons(tokens: TokenItem[]): ActionRowBuilder<ButtonBuilder>[] {
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        let currentRow = new ActionRowBuilder<ButtonBuilder>();
    
        for (const token of tokens) {
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
    
        return rows;
    }

    async function fetchUserTokens(interaction: ChatInputCommandInteraction, walletId: string): Promise<TokenResponse> {
        try {

        
        const getTokensByOwnerUrl = `https://narrative-server-production.up.railway.app/das/fungible/${walletId}`;
        const getTokensByOwner = await axios.get<TokenResponse>(getTokensByOwnerUrl);
        
        // Filter out dust amounts
        const filteredItems = getTokensByOwner.data.items.filter(filterDustAmounts);
        
        return {
            ...getTokensByOwner.data,
            items: filteredItems
        };

     } catch(error) {
        console.error('Error in trade command:', error);
        await interaction.reply({
            content: 'There was an error fetching your tokens',
            ephemeral: true
        });
     }
    }
    
    // Create the initial embed with token information
    async function createTokenEmbed(tokens: TokenItem[]): Promise<EmbedBuilder> {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Your Tokens')
            .setTimestamp();
    
        for (const token of tokens) {
            const balance = token.token_info?.balance / Math.pow(10, token.token_info?.decimals);
            const price = await getTokenPrice(token.id);
            const totalValue = balance * price;
    
            embed.addFields({
                name: token.content.metadata.name,
                value: `Address: \`${token?.id}\`\nBalance: ${balance?.toLocaleString()} ${token.content.metadata.symbol}\nPrice: $${price} \nTotal Value: $${totalValue}`,
                inline: false
            });

        }
    
        return embed;
    }

    function filterDustAmounts(tokenInfo: TokenItem): boolean {
        const balance = tokenInfo.token_info?.balance || 0;
        const decimals = tokenInfo.token_info?.decimals || 0;
        const actualBalance = balance / Math.pow(10, decimals);
        
        // For 6 decimals, filter out anything <= 0.000001
        const dustThreshold = 1 / Math.pow(10, decimals);
        return actualBalance > dustThreshold;
    }
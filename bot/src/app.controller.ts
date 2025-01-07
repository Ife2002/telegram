import { Controller, Get, Param } from '@nestjs/common';
import { AppService } from './app.service';
import { VaultService } from 'service/vault.service';
import { UserRepository } from 'service/user.repository';
import { PumpFunSDK } from 'pumpdotfun-sdk';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58'
import { AnchorProvider } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { getMarketFromDexscreener } from 'logic/utils/dexscreener';
import { preBondingMarketInfo } from 'logic/utils/preBondingMarketInfo';
import { getTokenInfo } from 'logic/utils/getTokenInfo';
import { getMint } from '@solana/spl-token';
import { getTokenPrice } from 'logic/utils/getPrice';

@Controller()
export class AppController {
  private vaultService: VaultService;
  private pumpService: PumpFunSDK;
  private connection: Connection;
  constructor(
    private readonly appService: AppService, 
    private readonly configService: ConfigService
  ) {
    this.connection = new Connection(process.env.HELIUS_RPC_URL)
    let wallet = new NodeWallet(Keypair.generate());
    
    const provider = new AnchorProvider(this.connection, wallet, {
      commitment: "finalized",
      });
      
    this.pumpService = new PumpFunSDK(provider)
    this.vaultService = new VaultService()
  }

  @Get()
  async getHello(): Promise<any> {
    // const mm = await getTokenPrice('BU7BuRDw2bvFCw1JqEzXbWH1qrhVk1pXjPhT8ZSppump')
    return 'Avalance server'
  }

  @Get('listWallets')
  getList(): Promise<any> {
    // getWallet('AdcS1YYgxJatPPDd621vRTqTX1nq8EWmCyB6KPUsLw7i', '840b9c07820d471bc60711108555ce20b381cac17c2708787d6f93ebf9a43594dbf373ae7bfa089b5707b7d0e8f49bd020accd417076b65bb6c3baad9ca84c7572d78c0017196a12a4f9445aaa7ac9941c4f5eda5862aa0c10efeacf2af9022a')
    return this.vaultService.listWallets()
  }

  @Get('migrateUsersToSetting')
  async migrateUsersToSetting(): Promise<any> {
    // getWallet('AdcS1YYgxJatPPDd621vRTqTX1nq8EWmCyB6KPUsLw7i', '840b9c07820d471bc60711108555ce20b381cac17c2708787d6f93ebf9a43594dbf373ae7bfa089b5707b7d0e8f49bd020accd417076b65bb6c3baad9ca84c7572d78c0017196a12a4f9445aaa7ac9941c4f5eda5862aa0c10efeacf2af9022a')
    return await UserRepository.migrateUsersAddEncryptedKey()
  }

  @Get('buy/:mintAddress')
  async buy(
    @Param('mintAddress') mintAddress: string,
  ): Promise<any> {

    const SLIPPAGE_BASIS_POINTS = 2500n;

    const buyer = Keypair.fromSecretKey(bs58.decode(this.configService.get('DEBUG_PKEY')))

    // return await this.pumpService.buy(buyer, new PublicKey(mintAddress), BigInt(0.001 * LAMPORTS_PER_SOL), SLIPPAGE_BASIS_POINTS, {
    //   unitLimit: 250000,
    //   unitPrice: 250000,
    // })
  }

  @Get('gmcap/:mintAddress')
  async getMcap(
    @Param('mintAddress') mintAddress: string,
  ): Promise<any> {

    const account = await this.pumpService.getBondingCurveAccount(new PublicKey(mintAddress));
  
    if (!account) return null;

    const mcap = account.getMarketCapSOL()

    console.log('Market Cap SOL:', ((Number(mcap)/ LAMPORTS_PER_SOL) * 189));
    
    return {
      discriminator: account.discriminator.toString(),
      virtualTokenReserves: account.virtualTokenReserves.toString(),
      virtualSolReserves: account.virtualSolReserves.toString(),
      realTokenReserves: account.realTokenReserves.toString(),
      realSolReserves: account.realSolReserves.toString(),
      tokenTotalSupply: account.tokenTotalSupply.toString(),
      complete: account.complete
    };
  }
}

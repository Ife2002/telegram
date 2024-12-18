import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { VaultService } from 'service/vault.service';
import { UserRepository } from 'service/user.repository';

@Controller()
export class AppController {
  private vaultService: VaultService

  constructor(private readonly appService: AppService) {
    this.vaultService = new VaultService()
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('listWallets')
  getList(): Promise<any> {
    // getWallet('AdcS1YYgxJatPPDd621vRTqTX1nq8EWmCyB6KPUsLw7i', '840b9c07820d471bc60711108555ce20b381cac17c2708787d6f93ebf9a43594dbf373ae7bfa089b5707b7d0e8f49bd020accd417076b65bb6c3baad9ca84c7572d78c0017196a12a4f9445aaa7ac9941c4f5eda5862aa0c10efeacf2af9022a')
    return this.vaultService.listWallets()
  }

  @Get('migrateUsersToSetting')
  async migrateUsersToSetting(): Promise<any> {
    // getWallet('AdcS1YYgxJatPPDd621vRTqTX1nq8EWmCyB6KPUsLw7i', '840b9c07820d471bc60711108555ce20b381cac17c2708787d6f93ebf9a43594dbf373ae7bfa089b5707b7d0e8f49bd020accd417076b65bb6c3baad9ca84c7572d78c0017196a12a4f9445aaa7ac9941c4f5eda5862aa0c10efeacf2af9022a')
    return await UserRepository.migrateAllUsersSettings()
  }
}

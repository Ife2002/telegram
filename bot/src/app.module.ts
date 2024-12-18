import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import bot from 'logic';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, { provide: 'TELEGRAM_BOT', useValue: bot}],
  exports: ['TELEGRAM_BOT'],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserSettings } from './entities/user-settings.entity';
import { UserBuddy } from './entities/user-buddy.entity';
import { UserService } from './user.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: [User, UserSettings, UserBuddy],
        synchronize: false, // Set to true only in development
        logging: false // To see the SQL queries
      }),
    TypeOrmModule.forFeature([User, UserSettings, UserBuddy])
  ],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe, HttpException, HttpStatus } from '@nestjs/common';
import { UserService } from './user.service';
import { ISettings, UserType } from '../../types/user.types';

// DTOs for request validation
class UpdateSettingsDto implements Partial<ISettings> {
  buyAmount?: number;
  autoBuyAmount?: number;
  slippage?: number;
  gasAdjustment?: number;
  defaultPriorityFee?: number;
  buyPrices?: Record<string, number>;
}

class UpdateBuddiesDto {
  buddyIds: string[];
}

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('/')
  async getAllUsers() {
    try {
      return await this.userService.getAllUsers();
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('discord')
  async createDiscordUser(@Body() createUserDto: Partial<UserType>) {
    try {
      const user = await this.userService.createUserDiscord({
        discordId: createUserDto.discordId,
        telegramId: createUserDto.telegramId || null
      });
      return user;
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to create Discord user',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // User endpoints
  @Get('discord/:discordId')
  async findByDiscordId(@Param('discordId') discordId: string) {
    try {
      const user = await this.userService.findByDiscordId(discordId);
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      return user;
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('telegram/:telegramId')
  async findByTelegramId(@Param('telegramId') telegramId: string) {
    try {
      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      return user;
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('wallet/:walletId')
  async findByWalletId(@Param('walletId') walletId: string) {
    try {
      const user = await this.userService.findByWalletId(walletId);
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      return user;
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Settings endpoints
  @Get(':userId/settings')
  async getAllSettings(@Param('userId', ParseUUIDPipe) userId: string) {
    try {
      return await this.userService.getAllSettings(userId);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':userId/settings')
  async updateSettings(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() updateSettingsDto: UpdateSettingsDto
  ) {
    try {
      return await this.userService.updateSettings(userId, updateSettingsDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':userId/settings/reset')
  async resetSettings(@Param('userId', ParseUUIDPipe) userId: string) {
    try {
      const success = await this.userService.resetSettings(userId);
      if (!success) {
        throw new HttpException('Failed to reset settings', HttpStatus.BAD_REQUEST);
      }
      return { message: 'Settings reset successfully' };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Buddy endpoints
  @Put(':userId/buddies')
  async setBuddies(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() updateBuddiesDto: UpdateBuddiesDto
  ) {
    try {
      await this.userService.setBuddies(userId, updateBuddiesDto.buddyIds);
      return { message: 'Buddies updated successfully' };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // User status endpoints
  @Put(':userId/blacklist')
  async setBlacklisted(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('blacklisted') blacklisted: boolean
  ) {
    try {
      return await this.userService.setBlacklisted(userId, blacklisted);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':userId/auto-buy')
  async setAutoBuy(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('enabled') enabled: boolean
  ) {
    try {
      return await this.userService.setAutoBuy(userId, enabled);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':userId/buddy-hash')
  async setBuddyHash(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body('buddyHash') buddyHash: string
  ) {
    try {
      return await this.userService.setBuddyHash(userId, buddyHash);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Individual settings endpoints
  @Get(':userId/settings/buy-amount')
  async getBuyAmount(@Param('userId', ParseUUIDPipe) userId: string) {
    try {
      return { buyAmount: await this.userService.getBuyAmount(userId) };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':userId/settings/buy-amount')
  async updateBuyAmount(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body('amount') amount: number
  ) {
    try {
      await this.userService.updateBuyAmount(userId, amount);
      return { message: 'Buy amount updated successfully' };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':userId/settings/slippage')
  async getSlippage(@Param('userId', ParseUUIDPipe) userId: string) {
    try {
      return { slippage: await this.userService.getSlippage(userId) };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':userId/settings/slippage')
  async updateSlippage(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body('slippage') slippage: number
  ) {
    try {
      await this.userService.updateSlippage(userId, slippage);
      return { message: 'Slippage updated successfully' };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':userId/settings/gas-adjustment')
  async getGasAdjustment(@Param('userId', ParseUUIDPipe) userId: string) {
    try {
      return { gasAdjustment: await this.userService.getGasAdjustment(userId) };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':userId/settings/gas-adjustment')
  async updateGasAdjustment(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body('adjustment') adjustment: number
  ) {
    try {
      await this.userService.updateGasAdjustment(userId, adjustment);
      return { message: 'Gas adjustment updated successfully' };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':userId/settings/priority-fee')
  async getDefaultPriorityFee(@Param('userId', ParseUUIDPipe) userId: string) {
    try {
      return { defaultPriorityFee: await this.userService.getDefaultPriorityFee(userId) };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':userId/settings/priority-fee')
  async updateDefaultPriorityFee(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body('fee') fee: number
  ) {
    try {
      await this.userService.updateDefaultPriorityFee(userId, fee);
      return { message: 'Priority fee updated successfully' };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Utility endpoints
//   @Delete(':userId')
//   async deleteUser(@Param('userId', ParseUUIDPipe) userId: string) {
//     try {
//       const success = await this.userService.deleteUser(userId);
//       if (!success) {
//         throw new HttpException('User not found', HttpStatus.NOT_FOUND);
//       }
//       return { message: 'User deleted successfully' };
//     } catch (error) {
//       throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
//     }
//   }
}
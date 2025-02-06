import { Module } from '@nestjs/common';
import { redis } from '../../service/config/redis.config';

@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useValue: redis
    }
  ],
  exports: ['REDIS_CLIENT']
})
export class RedisModule {}
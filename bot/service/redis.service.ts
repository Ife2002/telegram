import { redis } from './config/redis.config';

export class RedisService {
  static async ping(): Promise<boolean> {
    try {
      const result = await redis.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis connection error:', error);
      return false;
    }
  }

  static async closeConnection(): Promise<void> {
    await redis.quit();
  }
}
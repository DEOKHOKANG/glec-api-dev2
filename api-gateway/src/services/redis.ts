import Redis from 'ioredis';
import crypto from 'crypto';

// Redis client configuration
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryDelayOnFailure: 1000,
  maxRetriesPerRequest: 3,
  connectTimeout: 10000,
  commandTimeout: 5000,
  lazyConnect: true,
});

// Redis connection event handlers
redis.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

redis.on('ready', () => {
  console.log('🚀 Redis ready for operations');
});

redis.on('close', () => {
  console.log('🔌 Redis connection closed');
});

// Cache configuration
export const CACHE_CONFIG = {
  TTL: {
    CALCULATION_RESULT: 3600, // 1 hour
    EMISSIONS_FACTORS: 86400, // 24 hours  
    USER_DATA: 1800, // 30 minutes
    API_RESPONSE: 300, // 5 minutes
  },
  PREFIXES: {
    CALCULATION: 'calc:',
    EMISSIONS_FACTOR: 'ef:',
    USER: 'user:',
    API: 'api:',
    METRICS: 'metrics:',
  }
};

/**
 * Generate a consistent cache key from calculation inputs
 */
export function generateCacheKey(prefix: string, data: any): string {
  // Create deterministic hash from input data
  const normalizedData = JSON.stringify(data, Object.keys(data).sort());
  const hash = crypto.createHash('sha256').update(normalizedData).digest('hex');
  return `${prefix}${hash}`;
}

/**
 * Cache service for managing Redis operations
 */
export class CacheService {
  private redis: Redis;

  constructor() {
    this.redis = redis;
  }

  /**
   * Check if Redis is connected
   */
  async isConnected(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis ping failed:', error);
      return false;
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key: string, value: any, ttl: number = CACHE_CONFIG.TTL.API_RESPONSE): Promise<boolean> {
    try {
      const serializedValue = JSON.stringify(value);
      const result = await this.redis.setex(key, ttl, serializedValue);
      return result === 'OK';
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(key);
      return result > 0;
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) return 0;
      
      const result = await this.redis.del(...keys);
      console.log(`🗑️ Deleted ${result} keys matching pattern: ${pattern}`);
      return result;
    } catch (error) {
      console.error(`Cache delete pattern error for ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   */
  async getTTL(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      console.error(`Cache TTL error for key ${key}:`, error);
      return -1;
    }
  }

  /**
   * Increment counter in cache
   */
  async increment(key: string, increment: number = 1): Promise<number> {
    try {
      return await this.redis.incrby(key, increment);
    } catch (error) {
      console.error(`Cache increment error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<any> {
    try {
      const info = await this.redis.info('memory');
      const dbSize = await this.redis.dbsize();
      
      return {
        connected: await this.isConnected(),
        dbSize,
        memoryInfo: this.parseRedisInfo(info),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Cache stats error:', error);
      return {
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Parse Redis INFO command output
   */
  private parseRedisInfo(info: string): any {
    const result: any = {};
    const lines = info.split('\r\n');
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Flush all cache data (use with caution)
   */
  async flush(): Promise<boolean> {
    try {
      const result = await this.redis.flushdb();
      console.log('🧹 Cache flushed successfully');
      return result === 'OK';
    } catch (error) {
      console.error('Cache flush error:', error);
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
      console.log('🔌 Redis disconnected gracefully');
    } catch (error) {
      console.error('Redis disconnect error:', error);
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();

// Export Redis client for direct access if needed
export { redis };

export default cacheService;
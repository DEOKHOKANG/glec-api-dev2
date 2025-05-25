import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { Request, Response } from 'express';

// Redis 클라이언트 설정
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 0,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
});

// API Key에 따른 Rate Limit 설정
export interface RateLimitTier {
  windowMs: number;
  max: number;
  message: string;
}

export const rateLimitTiers: Record<string, RateLimitTier> = {
  basic: {
    windowMs: 15 * 60 * 1000, // 15분
    max: 100, // 100 requests per 15 minutes
    message: 'Basic tier: Too many requests from this API key, please try again later.'
  },
  premium: {
    windowMs: 15 * 60 * 1000, // 15분
    max: 500, // 500 requests per 15 minutes
    message: 'Premium tier: Too many requests from this API key, please try again later.'
  },
  enterprise: {
    windowMs: 15 * 60 * 1000, // 15분
    max: 2000, // 2000 requests per 15 minutes
    message: 'Enterprise tier: Too many requests from this API key, please try again later.'
  }
};

// 기본 IP 기반 Rate Limiting
export const basicRateLimit = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: 15 * 60 * 1000, // 15분
  max: 50, // IP당 15분에 50개 요청
  message: {
    error: 'Too many requests from this IP',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    return req.ip || req.connection.remoteAddress || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.round(req.rateLimit?.resetTime ? (req.rateLimit.resetTime - Date.now()) / 1000 : 900)
    });
  }
});

// API Key 기반 Rate Limiting
export const createApiKeyRateLimit = (tier: string = 'basic') => {
  const config = rateLimitTiers[tier];
  
  return rateLimit({
    store: new RedisStore({
      sendCommand: (...args: string[]) => redis.call(...args),
    }),
    windowMs: config.windowMs,
    max: config.max,
    message: {
      error: 'API key rate limit exceeded',
      tier,
      retryAfter: `${config.windowMs / 60000} minutes`
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const apiKey = req.headers['x-api-key'] as string || req.headers.authorization?.replace('Bearer ', '');
      return `api_key:${apiKey}`;
    },
    skip: (req: Request) => {
      // Skip rate limiting if no API key provided (will use basicRateLimit instead)
      const apiKey = req.headers['x-api-key'] || req.headers.authorization;
      return !apiKey;
    },
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: 'API key rate limit exceeded',
        message: config.message,
        tier,
        retryAfter: Math.round(req.rateLimit?.resetTime ? (req.rateLimit.resetTime - Date.now()) / 1000 : config.windowMs / 1000),
        usage: {
          current: req.rateLimit?.used || 0,
          limit: req.rateLimit?.limit || config.max,
          remaining: req.rateLimit?.remaining || 0,
          resetTime: req.rateLimit?.resetTime || Date.now() + config.windowMs
        }
      });
    }
  });
};

// 느린 다운 미들웨어 (점진적 지연)
export const speedLimiter = slowDown({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: 15 * 60 * 1000, // 15분
  delayAfter: 5, // 5번의 요청 후부터 지연 시작
  delayMs: 500, // 각 요청마다 500ms 추가 지연
  maxDelayMs: 10000, // 최대 10초 지연
  keyGenerator: (req: Request) => {
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
});

// Heavy 작업용 Rate Limiting (배출량 계산 등)
export const heavyOperationRateLimit = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: 60 * 1000, // 1분
  max: 10, // 1분에 10개 heavy operation
  message: {
    error: 'Heavy operation rate limit exceeded',
    message: 'Too many calculation requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const apiKey = req.headers['x-api-key'] as string || req.headers.authorization?.replace('Bearer ', '');
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    return apiKey ? `heavy_api:${apiKey}` : `heavy_ip:${ip}`;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Heavy operation rate limit exceeded',
      message: 'Too many calculation requests, please wait before trying again.',
      retryAfter: Math.round(req.rateLimit?.resetTime ? (req.rateLimit.resetTime - Date.now()) / 1000 : 60)
    });
  }
});

// Rate limit 정보를 응답 헤더에 추가하는 미들웨어
export const addRateLimitHeaders = (req: Request, res: Response, next: Function) => {
  // 기본 헤더들은 express-rate-limit이 자동으로 추가
  next();
};

// Rate limit 위반 로깅 미들웨어
export const logRateLimitViolations = (req: Request, res: Response, next: Function) => {
  const originalSend = res.send.bind(res);
  
  res.send = function(body: any) {
    if (res.statusCode === 429) {
      console.log(`Rate limit violation: ${req.ip} - ${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        apiKey: req.headers['x-api-key'] ? '[REDACTED]' : 'none',
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method
      });
    }
    return originalSend(body);
  };
  
  next();
};

export { redis };
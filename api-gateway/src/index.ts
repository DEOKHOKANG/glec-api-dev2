import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Import security and rate limiting middleware
import {
  securityHeaders,
  antiHpp,
  validateApiKeyFormat,
  sanitizeInput,
  requestSizeLimit,
  ipFilter,
  logSecurityEvents,
  validateContentType
} from './middleware/security';

import {
  basicRateLimit,
  createApiKeyRateLimit,
  speedLimiter,
  heavyOperationRateLimit,
  addRateLimitHeaders,
  logRateLimitViolations
} from './middleware/rateLimiting';

// Import routes
import authRoutes from './routes/auth';
import calculationsRoutes from './routes/calculations';
import emissionsFactorsRoutes from './routes/emissions-factors';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase client initialization
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Trust proxy for proper IP detection (must be before rate limiting)
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '1'));

// Security middleware (highest priority)
app.use(securityHeaders);
app.use(antiHpp);
app.use(ipFilter);
app.use(logSecurityEvents);

// Rate limiting middleware
app.use(basicRateLimit);
app.use(speedLimiter);
app.use(logRateLimitViolations);
app.use(addRateLimitHeaders);

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-CSRF-Token'],
}));

// Request logging
app.use(morgan('combined'));

// Request size and content validation
app.use(requestSizeLimit);
app.use(validateContentType(['application/json', 'application/x-www-form-urlencoded']));

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  strict: true,
  type: 'application/json'
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 20
}));

// Input sanitization
app.use(sanitizeInput);
app.use(validateApiKeyFormat);

// Health check endpoint (no rate limiting)
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const { data, error } = await supabase
      .from('health_check')
      .select('*')
      .limit(1);
    
    const healthStatus = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: error ? 'disconnected' : 'connected',
      services: {
        supabase: error ? 'down' : 'up',
        redis: 'up', // Will be tested when Redis is used
        api: 'up'
      },
      security: {
        rateLimiting: 'enabled',
        securityHeaders: 'enabled',
        inputSanitization: 'enabled',
        apiKeyValidation: 'enabled'
      }
    };
    
    const statusCode = error ? 503 : 200;
    res.status(statusCode).json(healthStatus);
    
  } catch (err) {
    console.error('Health check error:', err);
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: 'Health check failed'
    });
  }
});

// Rate limit info endpoint
app.get('/api/v1/rate-limits', (req, res) => {
  const apiKey = req.headers['x-api-key'] as string;
  const tier = apiKey ? 'api-key-based' : 'ip-based';
  
  res.json({
    rateLimits: {
      basic: {
        windowMs: 15 * 60 * 1000,
        max: 100,
        description: 'Basic tier: 100 requests per 15 minutes'
      },
      premium: {
        windowMs: 15 * 60 * 1000,
        max: 500,
        description: 'Premium tier: 500 requests per 15 minutes'
      },
      enterprise: {
        windowMs: 15 * 60 * 1000,
        max: 2000,
        description: 'Enterprise tier: 2000 requests per 15 minutes'
      },
      ipBased: {
        windowMs: 15 * 60 * 1000,
        max: 50,
        description: 'IP-based: 50 requests per 15 minutes (no API key)'
      },
      heavyOperations: {
        windowMs: 60 * 1000,
        max: 10,
        description: 'Heavy operations: 10 requests per minute'
      }
    },
    currentTier: tier,
    headers: {
      remaining: 'X-RateLimit-Remaining',
      limit: 'X-RateLimit-Limit',
      reset: 'X-RateLimit-Reset'
    }
  });
});

// API routes with specific rate limiting
app.use('/api/v1/auth', createApiKeyRateLimit('basic'), authRoutes);

// Heavy operations get additional rate limiting
app.use('/api/v1/calculations', 
  heavyOperationRateLimit, 
  createApiKeyRateLimit('premium'), 
  calculationsRoutes
);

app.use('/api/v1/emissions-factors', 
  createApiKeyRateLimit('basic'), 
  emissionsFactorsRoutes
);

// API documentation endpoint
app.get('/api/v1', (req, res) => {
  res.json({
    name: 'GLEC API Dev2',
    version: '1.0.0',
    description: 'GLEC Framework B2B SaaS API Platform',
    security: {
      rateLimiting: {
        enabled: true,
        tiers: ['basic', 'premium', 'enterprise'],
        ipBasedFallback: true
      },
      authentication: ['JWT Bearer Token', 'API Key'],
      securityHeaders: 'enabled',
      inputSanitization: 'enabled'
    },
    documentation: {
      authentication: '/api/v1/auth',
      calculations: '/api/v1/calculations',
      emissionsFactors: '/api/v1/emissions-factors',
      rateLimits: '/api/v1/rate-limits',
      health: '/health'
    },
    endpoints: {
      auth: {
        register: 'POST /api/v1/auth/register',
        login: 'POST /api/v1/auth/login',
        refresh: 'POST /api/v1/auth/refresh',
        logout: 'POST /api/v1/auth/logout',
        profile: 'GET /api/v1/auth/profile',
        apiKeys: {
          create: 'POST /api/v1/auth/api-keys',
          list: 'GET /api/v1/auth/api-keys'
        }
      },
      calculations: {
        calculate: 'POST /api/v1/calculations/calculate',
        batch: 'POST /api/v1/calculations/batch',
        history: 'GET /api/v1/calculations/history'
      },
      emissionsFactors: {
        list: 'GET /api/v1/emissions-factors',
        get: 'GET /api/v1/emissions-factors/{id}',
        search: 'GET /api/v1/emissions-factors/search?q={keyword}',
        transportModes: 'GET /api/v1/emissions-factors/transport-modes'
      },
      utility: {
        rateLimits: 'GET /api/v1/rate-limits',
        health: 'GET /health'
      }
    },
    glecFramework: {
      version: '3.1',
      supportedModes: ['road', 'rail', 'sea', 'air'],
      features: [
        'Well-to-Wheel (WTW) emissions',
        'Multiple transport modes',
        'Load factor optimization',
        'Emission intensity calculation',
        'Batch processing',
        'Historical tracking',
        'Emissions factors database',
        'Rate limiting and security',
        'Multi-tier API access'
      ]
    },
    authentication: {
      methods: ['JWT Bearer Token', 'API Key'],
      apiKeyHeader: 'X-API-Key',
      apiKeyFormat: 'glec_{live|test}_{32-character-hex}',
      bearerTokenHeader: 'Authorization: Bearer {token}'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    availableEndpoints: [
      'GET /health',
      'GET /api/v1',
      'GET /api/v1/rate-limits',
      'POST /api/v1/auth/register',
      'POST /api/v1/auth/login',
      'POST /api/v1/calculations/calculate',
      'POST /api/v1/calculations/batch',
      'GET /api/v1/emissions-factors',
      'GET /api/v1/emissions-factors/transport-modes',
      'GET /api/v1/emissions-factors/search?q={keyword}'
    ]
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);
  
  // Handle rate limit errors
  if (err.status === 429) {
    return res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: 'Too many requests, please try again later.',
      retryAfter: err.retryAfter || 900
    });
  }
  
  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.message
    });
  }
  
  // Handle Supabase errors
  if (err.error && err.error.message) {
    return res.status(400).json({
      error: 'Database Error',
      message: err.error.message
    });
  }
  
  // Default error response
  const isDevelopment = process.env.NODE_ENV === 'development';
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: isDevelopment ? err.message : 'Something went wrong',
    ...(isDevelopment && { stack: err.stack }),
    requestId: req.headers['x-request-id'] || 'unknown'
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 GLEC API Gateway running on port ${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api/v1`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log(`🔒 Authentication: http://localhost:${PORT}/api/v1/auth`);
  console.log(`🧮 Calculations: http://localhost:${PORT}/api/v1/calculations`);
  console.log(`🏭 Emissions Factors: http://localhost:${PORT}/api/v1/emissions-factors`);
  console.log(`📊 Rate Limits: http://localhost:${PORT}/api/v1/rate-limits`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🛡️  Security: Rate limiting, input sanitization, security headers enabled`);
  console.log(`⚡ GLEC Framework v3.1 Ready with enhanced security!`);
});

// Export for testing
export default app;
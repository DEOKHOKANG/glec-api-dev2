import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Import routes
import authRoutes from './routes/auth';
import calculationsRoutes from './routes/calculations';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase client initialization
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// Request logging
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy for proper IP detection
app.set('trust proxy', 1);

// Health check endpoint
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
        api: 'up'
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

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/calculations', calculationsRoutes);

// API documentation endpoint
app.get('/api/v1', (req, res) => {
  res.json({
    name: 'GLEC API Dev2',
    version: '1.0.0',
    description: 'GLEC Framework B2B SaaS API Platform',
    documentation: {
      authentication: '/api/v1/auth',
      calculations: '/api/v1/calculations',
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
        'Historical tracking'
      ]
    },
    authentication: {
      methods: ['JWT Bearer Token', 'API Key'],
      apiKeyHeader: 'X-API-Key',
      apiKeyFormat: 'glec_[64-character-hex]'
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
      'POST /api/v1/auth/register',
      'POST /api/v1/auth/login',
      'POST /api/v1/calculations/calculate',
      'POST /api/v1/calculations/batch'
    ]
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);
  
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
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
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
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⚡ GLEC Framework v3.1 Ready!`);
});

// Export for testing
export default app;
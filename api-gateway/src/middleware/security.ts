import helmet from 'helmet';
import hpp from 'hpp';
import { Request, Response, NextFunction } from 'express';
import { body, query, param, validationResult } from 'express-validator';

// Enhanced Security Headers Configuration
export const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  
  // Cross-Origin Embedder Policy
  crossOriginEmbedderPolicy: false, // API이므로 false로 설정
  
  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1년
    includeSubDomains: true,
    preload: true
  },
  
  // X-Frame-Options
  frameguard: {
    action: 'deny'
  },
  
  // X-Content-Type-Options
  noSniff: true,
  
  // X-XSS-Protection
  xssFilter: true,
  
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },
  
  // X-Permitted-Cross-Domain-Policies
  permittedCrossDomainPolicies: false,
  
  // X-DNS-Prefetch-Control
  dnsPrefetchControl: {
    allow: false
  }
});

// HTTP Parameter Pollution (HPP) 방지
export const antiHpp = hpp({
  whitelist: ['sort', 'fields', 'page', 'limit'] // 허용할 중복 파라미터
});

// API Key 보안 검증 미들웨어
export const validateApiKeyFormat = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (apiKey) {
    // API Key 형식 검증 (예: glec_live_xxx 또는 glec_test_xxx)
    const apiKeyPattern = /^glec_(live|test)_[a-zA-Z0-9]{32}$/;
    if (!apiKeyPattern.test(apiKey)) {
      return res.status(401).json({
        error: 'Invalid API key format',
        message: 'API key must follow the format: glec_{live|test}_{32_characters}'
      });
    }
  }
  
  next();
};

// SQL Injection 및 NoSQL Injection 방지
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  const sanitizeString = (obj: any): any => {
    if (typeof obj === 'string') {
      // SQL Injection 패턴 제거
      return obj.replace(/['";\\]/g, '');
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeString);
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        sanitized[key] = sanitizeString(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  // Query parameters 정리
  if (req.query) {
    req.query = sanitizeString(req.query);
  }
  
  // Body parameters 정리
  if (req.body) {
    req.body = sanitizeString(req.body);
  }
  
  next();
};

// Request Size 제한
export const requestSizeLimit = (req: Request, res: Response, next: NextFunction) => {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (contentLength > maxSize) {
    return res.status(413).json({
      error: 'Request too large',
      message: `Request size exceeds ${maxSize / 1024 / 1024}MB limit`,
      maxSize: `${maxSize / 1024 / 1024}MB`
    });
  }
  
  next();
};

// CSRF 토큰 검증 (웹 대시보드용)
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // API 요청은 CSRF 검증 제외 (API Key 또는 Bearer 토큰 사용)
  const isApiRequest = req.headers['x-api-key'] || 
                      req.headers['authorization']?.startsWith('Bearer ') ||
                      req.path.startsWith('/api/');
  
  if (isApiRequest) {
    return next();
  }
  
  // 웹 대시보드 요청에 대한 CSRF 검증
  const csrfToken = req.headers['x-csrf-token'] as string;
  const sessionCsrfToken = req.session?.csrfToken;
  
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    if (!csrfToken || !sessionCsrfToken || csrfToken !== sessionCsrfToken) {
      return res.status(403).json({
        error: 'CSRF token mismatch',
        message: 'Invalid or missing CSRF token'
      });
    }
  }
  
  next();
};

// IP 화이트리스트/블랙리스트 검증
export const ipFilter = (req: Request, res: Response, next: NextFunction) => {
  const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  
  // 블랙리스트 IP 확인
  const blacklistedIPs = process.env.BLACKLISTED_IPS?.split(',') || [];
  if (blacklistedIPs.includes(clientIp!)) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Your IP address is blocked'
    });
  }
  
  // 화이트리스트가 설정된 경우 (관리자 API 등)
  const whitelistedIPs = process.env.WHITELISTED_IPS?.split(',') || [];
  if (whitelistedIPs.length > 0 && !whitelistedIPs.includes(clientIp!)) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Your IP address is not whitelisted'
    });
  }
  
  next();
};

// Request 검증 에러 핸들링
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Invalid request parameters',
      details: errors.array().map(error => ({
        field: error.type === 'field' ? error.path : error.type,
        message: error.msg,
        value: error.type === 'field' ? error.value : undefined
      }))
    });
  }
  
  next();
};

// Common validation rules
export const validationRules = {
  // UUID 검증
  uuid: param('id').isUUID().withMessage('Invalid ID format'),
  
  // 페이지네이션 검증
  pagination: [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  
  // 이메일 검증
  email: body('email').isEmail().normalizeEmail().withMessage('Invalid email format'),
  
  // 계산 요청 검증
  calculation: [
    body('transport_mode').isIn(['road', 'rail', 'sea', 'air']).withMessage('Invalid transport mode'),
    body('distance').isFloat({ min: 0.1 }).withMessage('Distance must be a positive number'),
    body('cargo_weight').optional().isFloat({ min: 0 }).withMessage('Cargo weight must be non-negative')
  ]
};

// Security 정보 로깅
export const logSecurityEvents = (req: Request, res: Response, next: NextFunction) => {
  const originalSend = res.send.bind(res);
  
  res.send = function(body: any) {
    // 보안 관련 응답 로깅
    if ([401, 403, 422, 429].includes(res.statusCode)) {
      console.log(`Security event: ${res.statusCode} - ${req.ip} - ${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        statusCode: res.statusCode,
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        hasApiKey: !!req.headers['x-api-key'],
        hasAuth: !!req.headers['authorization']
      });
    }
    return originalSend(body);
  };
  
  next();
};

// Content-Type 검증
export const validateContentType = (expectedTypes: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      const contentType = req.headers['content-type'];
      
      if (!contentType || !expectedTypes.some(type => contentType.includes(type))) {
        return res.status(415).json({
          error: 'Unsupported Media Type',
          message: `Content-Type must be one of: ${expectedTypes.join(', ')}`,
          received: contentType || 'none'
        });
      }
    }
    
    next();
  };
};
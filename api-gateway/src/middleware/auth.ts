import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
  };
  apiKey?: {
    id: string;
    userId: string;
    keyName: string;
  };
}

/**
 * JWT 토큰 검증 미들웨어
 */
export const verifyJWT = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token required' });
    }
    
    const token = authHeader.substring(7);
    
    // Supabase JWT 검증
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    req.user = {
      id: user.id,
      email: user.email!,
      role: user.user_metadata?.role || 'user'
    };
    
    next();
  } catch (error) {
    console.error('JWT verification error:', error);
    res.status(401).json({ error: 'Token verification failed' });
  }
};

/**
 * API Key 검증 미들웨어
 */
export const verifyAPIKey = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }
    
    // API Key 형식 확인 (glec_로 시작)
    if (!apiKey.startsWith('glec_')) {
      return res.status(401).json({ error: 'Invalid API key format' });
    }
    
    // 데이터베이스에서 API Key 검증
    const { data: keyData, error } = await supabase
      .from('api_keys')
      .select('id, user_id, key_name, is_active, user_profiles(*)')
      .eq('key_hash', apiKey)
      .eq('is_active', true)
      .single();
    
    if (error || !keyData) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    req.apiKey = {
      id: keyData.id,
      userId: keyData.user_id,
      keyName: keyData.key_name
    };
    
    req.user = {
      id: keyData.user_id,
      email: keyData.user_profiles.email,
      role: 'api_user'
    };
    
    next();
  } catch (error) {
    console.error('API Key verification error:', error);
    res.status(401).json({ error: 'API key verification failed' });
  }
};

/**
 * 권한 검증 미들웨어
 */
export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!roles.includes(req.user.role!)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
};

/**
 * API 사용량 추적 미들웨어
 */
export const trackAPIUsage = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user) {
      // API 사용량 기록
      await supabase
        .from('api_usage_logs')
        .insert({
          user_id: req.user.id,
          endpoint: req.path,
          method: req.method,
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          api_key_id: req.apiKey?.id
        });
    }
    
    next();
  } catch (error) {
    console.error('API usage tracking error:', error);
    // 사용량 추적 실패해도 요청은 계속 진행
    next();
  }
};
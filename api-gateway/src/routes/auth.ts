import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { verifyJWT, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

const registerSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  companyName: z.string().min(1, 'Company name is required').optional()
});

const createAPIKeySchema = z.object({
  name: z.string().min(1, 'API key name is required'),
  description: z.string().optional()
});

/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     tags: [Authentication]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               companyName:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Invalid input data
 *       409:
 *         description: User already exists
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const validationResult = registerSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid input data',
        details: validationResult.error.errors
      });
    }
    
    const { email, password, companyName } = validationResult.data;
    
    // Supabase로 사용자 생성
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          company_name: companyName
        }
      }
    });
    
    if (authError) {
      return res.status(400).json({ error: authError.message });
    }
    
    if (!authData.user) {
      return res.status(400).json({ error: 'Failed to create user' });
    }
    
    // 사용자 프로필 생성
    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        email: authData.user.email!,
        company_name: companyName,
        api_quota: 1000 // 기본 API 할당량
      });
    
    if (profileError) {
      console.error('Profile creation error:', profileError);
      // 프로필 생성 실패해도 계속 진행 (사용자는 이미 생성됨)
    }
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        emailConfirmed: authData.user.email_confirmed_at !== null
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: User login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const validationResult = loginSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid input data',
        details: validationResult.error.errors
      });
    }
    
    const { email, password } = validationResult.data;
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (!data.user || !data.session) {
      return res.status(401).json({ error: 'Authentication failed' });
    }
    
    res.json({
      message: 'Login successful',
      user: {
        id: data.user.id,
        email: data.user.email,
        lastSignIn: data.user.last_sign_in_at
      },
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [Authentication]
 *     summary: Refresh access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken
    });
    
    if (error) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    
    if (!data.session) {
      return res.status(401).json({ error: 'Token refresh failed' });
    }
    
    res.json({
      message: 'Token refreshed successfully',
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at
      }
    });
    
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: User logout
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Not authenticated
 */
router.post('/logout', verifyJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.substring(7);
    
    if (token) {
      await supabase.auth.signOut();
    }
    
    res.json({ message: 'Logout successful' });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/v1/auth/api-keys:
 *   post:
 *     tags: [API Keys]
 *     summary: Create a new API key
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: API key created successfully
 *       401:
 *         description: Not authenticated
 */
router.post('/api-keys', verifyJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationResult = createAPIKeySchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid input data',
        details: validationResult.error.errors
      });
    }
    
    const { name, description } = validationResult.data;
    const userId = req.user!.id;
    
    // API Key 생성 (32바이트 랜덤 + prefix)
    const keyValue = `glec_${crypto.randomBytes(32).toString('hex')}`;
    
    const { data: apiKey, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: userId,
        key_name: name,
        key_hash: keyValue,
        description,
        is_active: true
      })
      .select()
      .single();
    
    if (error) {
      console.error('API key creation error:', error);
      return res.status(500).json({ error: 'Failed to create API key' });
    }
    
    res.status(201).json({
      message: 'API key created successfully',
      apiKey: {
        id: apiKey.id,
        name: apiKey.key_name,
        key: keyValue, // 한 번만 반환
        description: apiKey.description,
        createdAt: apiKey.created_at
      }
    });
    
  } catch (error) {
    console.error('API key creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/v1/auth/api-keys:
 *   get:
 *     tags: [API Keys]
 *     summary: Get user's API keys
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API keys retrieved successfully
 *       401:
 *         description: Not authenticated
 */
router.get('/api-keys', verifyJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const { data: apiKeys, error } = await supabase
      .from('api_keys')
      .select('id, key_name, description, is_active, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('API keys retrieval error:', error);
      return res.status(500).json({ error: 'Failed to retrieve API keys' });
    }
    
    res.json({
      apiKeys: apiKeys.map(key => ({
        id: key.id,
        name: key.key_name,
        description: key.description,
        isActive: key.is_active,
        createdAt: key.created_at
      }))
    });
    
  } catch (error) {
    console.error('API keys retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/v1/auth/profile:
 *   get:
 *     tags: [Authentication]
 *     summary: Get user profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *       401:
 *         description: Not authenticated
 */
router.get('/profile', verifyJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('Profile retrieval error:', error);
      return res.status(500).json({ error: 'Failed to retrieve profile' });
    }
    
    res.json({
      profile: {
        id: profile.id,
        email: profile.email,
        companyName: profile.company_name,
        apiQuota: profile.api_quota,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      }
    });
    
  } catch (error) {
    console.error('Profile retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
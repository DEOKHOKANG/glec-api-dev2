import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Supabase 클라이언트 초기화
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

/**
 * @openapi
 * /api/v1/emissions-factors:
 *   get:
 *     tags: [Emissions Factors]
 *     summary: 배출량 계수 조회
 *     description: 운송 모드, 연료 타입, 차량 타입별 배출량 계수를 조회합니다.
 *     parameters:
 *       - in: query
 *         name: transport_mode
 *         schema:
 *           type: string
 *           enum: [road, sea, air, rail]
 *         description: 운송 모드 필터
 *       - in: query
 *         name: fuel_type
 *         schema:
 *           type: string
 *         description: 연료 타입 필터
 *       - in: query
 *         name: vehicle_type
 *         schema:
 *           type: string
 *         description: 차량 타입 필터
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: 결과 개수 제한
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: 페이지네이션 오프셋
 *     responses:
 *       200:
 *         description: 배출량 계수 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       transport_mode:
 *                         type: string
 *                         enum: [road, sea, air, rail]
 *                       fuel_type:
 *                         type: string
 *                       vehicle_type:
 *                         type: string
 *                       emission_factor_co2e:
 *                         type: number
 *                       unit:
 *                         type: string
 *                       source:
 *                         type: string
 *                       valid_from:
 *                         type: string
 *                         format: date
 *                       valid_to:
 *                         type: string
 *                         format: date
 *                         nullable: true
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     count:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      transport_mode,
      fuel_type,
      vehicle_type,
      limit = 50,
      offset = 0
    } = req.query;

    // 쿼리 빌더 생성
    let query = supabase
      .from('emissions_factors')
      .select('*', { count: 'exact' });

    // 필터 적용
    if (transport_mode) {
      query = query.eq('transport_mode', transport_mode);
    }
    if (fuel_type) {
      query = query.eq('fuel_type', fuel_type);
    }
    if (vehicle_type) {
      query = query.eq('vehicle_type', vehicle_type);
    }

    // 페이지네이션 적용
    query = query
      .range(Number(offset), Number(offset) + Number(limit) - 1)
      .order('transport_mode', { ascending: true })
      .order('vehicle_type', { ascending: true });

    const { data, error, count } = await query;

    if (error) {
      return res.status(500).json({
        error: 'Database query failed',
        message: error.message
      });
    }

    res.json({
      data,
      meta: {
        total: count || 0,
        count: data?.length || 0,
        limit: Number(limit),
        offset: Number(offset)
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Internal server error',
      message: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

/**
 * @openapi
 * /api/v1/emissions-factors/transport-modes:
 *   get:
 *     tags: [Emissions Factors]
 *     summary: 지원되는 운송 모드 목록 조회
 *     description: 시스템에서 지원하는 모든 운송 모드와 관련 정보를 조회합니다.
 *     responses:
 *       200:
 *         description: 운송 모드 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       transport_mode:
 *                         type: string
 *                       count:
 *                         type: integer
 *                       fuel_types:
 *                         type: array
 *                         items:
 *                           type: string
 *                       vehicle_types:
 *                         type: array
 *                         items:
 *                           type: string
 */
router.get('/transport-modes', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .rpc('get_transport_modes_summary');

    if (error) {
      // Fallback query if RPC doesn't exist
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('emissions_factors')
        .select('transport_mode, fuel_type, vehicle_type');

      if (fallbackError) {
        return res.status(500).json({
          error: 'Database query failed',
          message: fallbackError.message
        });
      }

      // Group by transport_mode manually
      const grouped = fallbackData?.reduce((acc: any, item: any) => {
        const mode = item.transport_mode;
        if (!acc[mode]) {
          acc[mode] = {
            transport_mode: mode,
            count: 0,
            fuel_types: new Set(),
            vehicle_types: new Set()
          };
        }
        acc[mode].count++;
        acc[mode].fuel_types.add(item.fuel_type);
        acc[mode].vehicle_types.add(item.vehicle_type);
        return acc;
      }, {});

      const result = Object.values(grouped || {}).map((item: any) => ({
        transport_mode: item.transport_mode,
        count: item.count,
        fuel_types: Array.from(item.fuel_types),
        vehicle_types: Array.from(item.vehicle_types)
      }));

      return res.json({ data: result });
    }

    res.json({ data });
  } catch (err) {
    res.status(500).json({
      error: 'Internal server error',
      message: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

/**
 * @openapi
 * /api/v1/emissions-factors/search:
 *   get:
 *     tags: [Emissions Factors]
 *     summary: 배출량 계수 검색
 *     description: 키워드를 이용하여 배출량 계수를 검색합니다.
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 검색 키워드 (운송 모드, 연료 타입, 차량 타입)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: 검색 결과 개수 제한
 *     responses:
 *       200:
 *         description: 검색 결과
 *       400:
 *         description: 검색 키워드가 필요함
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Search query parameter "q" is required'
      });
    }

    const searchTerm = q.toLowerCase();

    const { data, error } = await supabase
      .from('emissions_factors')
      .select('*')
      .or(`transport_mode.ilike.%${searchTerm}%,fuel_type.ilike.%${searchTerm}%,vehicle_type.ilike.%${searchTerm}%`)
      .limit(Number(limit));

    if (error) {
      return res.status(500).json({
        error: 'Search failed',
        message: error.message
      });
    }

    res.json({
      data,
      meta: {
        query: q,
        count: data?.length || 0,
        limit: Number(limit)
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Internal server error',
      message: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

/**
 * @openapi
 * /api/v1/emissions-factors/{id}:
 *   get:
 *     tags: [Emissions Factors]
 *     summary: 특정 배출량 계수 조회
 *     description: ID를 이용하여 특정 배출량 계수의 상세 정보를 조회합니다.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 배출량 계수 ID
 *     responses:
 *       200:
 *         description: 배출량 계수 상세 정보
 *       404:
 *         description: 배출량 계수를 찾을 수 없음
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('emissions_factors')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Not found',
          message: 'Emissions factor not found'
        });
      }
      return res.status(500).json({
        error: 'Database query failed',
        message: error.message
      });
    }

    res.json({ data });
  } catch (err) {
    res.status(500).json({
      error: 'Internal server error',
      message: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

export default router;
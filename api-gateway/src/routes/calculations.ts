import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { verifyAPIKey, verifyJWT, AuthenticatedRequest, trackAPIUsage } from '../middleware/auth';
import { CalculatorFactory } from '../services/emission-calculator';
import { 
  CalculationRequest, 
  BatchCalculationRequest, 
  TransportMode,
  FuelType 
} from '../../shared/types/glec';

const router = Router();

// Validation schemas
const vehicleSchema = z.object({
  type: z.string().min(1, 'Vehicle type is required'),
  subType: z.string().optional(),
  fuelType: z.enum(['diesel', 'petrol', 'electric', 'hybrid', 'hfo', 'mgo', 'lng', 'jet_fuel', 'biodiesel', 'hydrogen'] as const),
  capacity: z.object({
    weight: z.number().optional(),
    volume: z.number().optional(),
    passengers: z.number().optional()
  }).optional()
});

const activityDataSchema = z.object({
  transportMode: z.enum(['road', 'rail', 'sea', 'air'] as const),
  vehicle: vehicleSchema,
  distance: z.number().positive('Distance must be positive'),
  weight: z.number().nonnegative('Weight cannot be negative').optional(),
  volume: z.number().nonnegative('Volume cannot be negative').optional(),
  loadFactor: z.number().min(0).max(1, 'Load factor must be between 0 and 1').optional(),
  emptyReturn: z.boolean().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  routeType: z.enum(['highway', 'urban', 'mixed', 'international']).optional(),
  fuelConsumed: z.number().nonnegative().optional(),
  energyUnit: z.enum(['liters', 'kwh', 'kg']).optional()
});

const calculationRequestSchema = z.object({
  activityData: activityDataSchema,
  options: z.object({
    includeIndirectEmissions: z.boolean().optional(),
    roundingPrecision: z.number().min(0).max(6).optional(),
    includeBiogenic: z.boolean().optional()
  }).optional()
});

const batchCalculationSchema = z.object({
  calculations: z.array(calculationRequestSchema).min(1).max(100),
  options: z.object({
    aggregateResults: z.boolean().optional(),
    includeDetailedBreakdown: z.boolean().optional()
  }).optional()
});

/**
 * @openapi
 * /api/v1/calculations/calculate:
 *   post:
 *     tags: [Emissions Calculations]
 *     summary: Calculate emissions for a single transport activity
 *     security:
 *       - bearerAuth: []
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [activityData]
 *             properties:
 *               activityData:
 *                 type: object
 *                 required: [transportMode, vehicle, distance]
 *                 properties:
 *                   transportMode:
 *                     type: string
 *                     enum: [road, rail, sea, air]
 *                   vehicle:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         example: truck
 *                       fuelType:
 *                         type: string
 *                         enum: [diesel, petrol, electric, hybrid, hfo, mgo, lng, jet_fuel]
 *                   distance:
 *                     type: number
 *                     example: 500
 *                     description: Distance in kilometers
 *                   weight:
 *                     type: number
 *                     example: 25
 *                     description: Cargo weight in tonnes
 *                   loadFactor:
 *                     type: number
 *                     example: 0.8
 *                     description: Load factor (0-1)
 *               options:
 *                 type: object
 *                 properties:
 *                   includeIndirectEmissions:
 *                     type: boolean
 *                     default: true
 *                   roundingPrecision:
 *                     type: integer
 *                     default: 2
 *     responses:
 *       200:
 *         description: Emissions calculation completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 calculationId:
 *                   type: string
 *                 emissions:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                       description: Total CO2 equivalent emissions (kg)
 *                     co2:
 *                       type: number
 *                     breakdown:
 *                       type: object
 *                 metrics:
 *                   type: object
 *                 metadata:
 *                   type: object
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Calculation error
 */
router.post('/calculate', 
  // Authentication middleware (JWT or API Key)
  (req: AuthenticatedRequest, res: Response, next) => {
    // Try JWT first, then API Key
    if (req.headers.authorization) {
      verifyJWT(req, res, next);
    } else if (req.headers['x-api-key']) {
      verifyAPIKey(req, res, next);
    } else {
      res.status(401).json({ error: 'Authentication required. Provide either JWT token or API key.' });
    }
  },
  trackAPIUsage,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Validate request body
      const validationResult = calculationRequestSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Invalid input data',
          details: validationResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            received: err.received
          }))
        });
      }

      const request: CalculationRequest = validationResult.data;
      
      // Get appropriate calculator for transport mode
      const calculator = CalculatorFactory.getCalculator(request.activityData.transportMode);
      
      // Perform calculation
      const result = await calculator.calculate(request);
      
      // Store calculation result in database for history
      const { error: storeError } = await storeCalculationResult(req.user!.id, result);
      if (storeError) {
        console.error('Failed to store calculation result:', storeError);
        // Continue anyway - calculation was successful
      }

      // Apply rounding if specified
      const precision = request.options?.roundingPrecision ?? 2;
      const roundedResult = roundEmissions(result, precision);

      res.json({
        success: true,
        calculationId: result.metadata.calculationId,
        result: roundedResult,
        glecVersion: result.metadata.glecVersion,
        calculatedAt: result.metadata.calculatedAt
      });

    } catch (error) {
      console.error('Calculation error:', error);
      
      if (error instanceof Error && error.message.includes('Validation failed')) {
        res.status(400).json({
          error: 'Validation Error',
          message: error.message
        });
      } else {
        res.status(500).json({
          error: 'Calculation Error',
          message: 'Failed to calculate emissions',
          details: process.env.NODE_ENV === 'development' ? error : undefined
        });
      }
    }
  }
);

/**
 * @openapi
 * /api/v1/calculations/batch:
 *   post:
 *     tags: [Emissions Calculations]
 *     summary: Calculate emissions for multiple transport activities
 *     security:
 *       - bearerAuth: []
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [calculations]
 *             properties:
 *               calculations:
 *                 type: array
 *                 maxItems: 100
 *                 items:
 *                   $ref: '#/components/schemas/CalculationRequest'
 *               options:
 *                 type: object
 *                 properties:
 *                   aggregateResults:
 *                     type: boolean
 *                     default: false
 *     responses:
 *       200:
 *         description: Batch calculations completed
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Authentication required
 */
router.post('/batch',
  (req: AuthenticatedRequest, res: Response, next) => {
    if (req.headers.authorization) {
      verifyJWT(req, res, next);
    } else if (req.headers['x-api-key']) {
      verifyAPIKey(req, res, next);
    } else {
      res.status(401).json({ error: 'Authentication required' });
    }
  },
  trackAPIUsage,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validationResult = batchCalculationSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Invalid batch request',
          details: validationResult.error.errors
        });
      }

      const batchRequest: BatchCalculationRequest = validationResult.data;
      const results = [];
      const errors = [];

      // Process each calculation
      for (let i = 0; i < batchRequest.calculations.length; i++) {
        try {
          const request = batchRequest.calculations[i];
          const calculator = CalculatorFactory.getCalculator(request.activityData.transportMode);
          const result = await calculator.calculate(request);
          results.push({ index: i, result });
        } catch (error) {
          errors.push({ 
            index: i, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }

      // Aggregate results if requested
      let aggregate;
      if (batchRequest.options?.aggregateResults && results.length > 0) {
        aggregate = {
          totalEmissions: results.reduce((sum, r) => sum + r.result.emissions.total, 0),
          averageIntensity: results.reduce((sum, r) => sum + r.result.metrics.emissionIntensity, 0) / results.length,
          totalDistance: results.reduce((sum, r) => sum + (r.result.input.activityData.distance || 0), 0),
          totalWeight: results.reduce((sum, r) => sum + (r.result.input.activityData.weight || 0), 0),
          calculationCount: results.length
        };
      }

      res.json({
        success: true,
        individual: results.map(r => r.result),
        aggregate,
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          totalRequests: batchRequest.calculations.length,
          successful: results.length,
          failed: errors.length
        }
      });

    } catch (error) {
      console.error('Batch calculation error:', error);
      res.status(500).json({
        error: 'Batch Calculation Error',
        message: 'Failed to process batch calculations'
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/calculations/history:
 *   get:
 *     tags: [Emissions Calculations]
 *     summary: Get user's calculation history
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of results to skip
 *       - in: query
 *         name: transportMode
 *         schema:
 *           type: string
 *           enum: [road, rail, sea, air]
 *         description: Filter by transport mode
 *     responses:
 *       200:
 *         description: Calculation history retrieved
 *       401:
 *         description: Authentication required
 */
router.get('/history', verifyJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const transportMode = req.query.transportMode as TransportMode;

    let query = supabase
      .from('emissions_calculations')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (transportMode) {
      query = query.eq('calculation_type', transportMode);
    }

    const { data: calculations, error } = await query;

    if (error) {
      throw error;
    }

    res.json({
      calculations: calculations?.map(calc => ({
        id: calc.id,
        calculationType: calc.calculation_type,
        inputData: calc.input_data,
        resultData: calc.result_data,
        createdAt: calc.created_at
      })) || [],
      pagination: {
        limit,
        offset,
        hasMore: (calculations?.length || 0) === limit
      }
    });

  } catch (error) {
    console.error('History retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve calculation history'
    });
  }
});

// Helper functions
async function storeCalculationResult(userId: string, result: any) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  
  return await supabase
    .from('emissions_calculations')
    .insert({
      user_id: userId,
      calculation_type: result.input.activityData.transportMode,
      input_data: result.input,
      result_data: result
    });
}

function roundEmissions(result: any, precision: number) {
  const round = (num: number) => Math.round(num * Math.pow(10, precision)) / Math.pow(10, precision);
  
  return {
    ...result,
    emissions: {
      ...result.emissions,
      total: round(result.emissions.total),
      co2: round(result.emissions.co2),
      ch4: result.emissions.ch4 ? round(result.emissions.ch4) : undefined,
      n2o: result.emissions.n2o ? round(result.emissions.n2o) : undefined
    },
    breakdown: {
      ...result.breakdown,
      directEmissions: round(result.breakdown.directEmissions),
      indirectEmissions: round(result.breakdown.indirectEmissions)
    },
    metrics: {
      ...result.metrics,
      emissionIntensity: round(result.metrics.emissionIntensity)
    }
  };
}

export default router;
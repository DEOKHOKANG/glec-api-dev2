import { 
  TransportMode, 
  ActivityData, 
  EmissionFactor, 
  EmissionCalculationResult, 
  CalculationRequest,
  CalculationError,
  GLEC_CONSTANTS 
} from '../../shared/types/glec';

/**
 * Abstract base class for emission calculators
 * Implements Strategy Pattern for different transport modes
 */
export abstract class EmissionCalculator {
  protected transportMode: TransportMode;
  
  constructor(transportMode: TransportMode) {
    this.transportMode = transportMode;
  }

  /**
   * Main calculation method - Template Method Pattern
   */
  async calculate(request: CalculationRequest): Promise<EmissionCalculationResult> {
    // 1. Validate input data
    const validationErrors = this.validateInput(request.activityData);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
    }

    // 2. Get appropriate emission factor
    const emissionFactor = await this.getEmissionFactor(request.activityData);
    
    // 3. Normalize activity data
    const normalizedData = this.normalizeActivityData(request.activityData);
    
    // 4. Perform calculation (implemented by subclasses)
    const emissions = this.calculateEmissions(normalizedData, emissionFactor, request.options);
    
    // 5. Generate detailed result
    return this.buildResult(normalizedData, emissionFactor, emissions, request);
  }

  /**
   * Validate input data for the specific transport mode
   */
  protected abstract validateInput(data: ActivityData): CalculationError[];

  /**
   * Get emission factor for the transport mode and vehicle type
   */
  protected abstract getEmissionFactor(data: ActivityData): Promise<EmissionFactor>;

  /**
   * Normalize and unit convert activity data
   */
  protected abstract normalizeActivityData(data: ActivityData): ActivityData;

  /**
   * Core calculation logic for the specific transport mode
   */
  protected abstract calculateEmissions(
    data: ActivityData, 
    factor: EmissionFactor, 
    options?: any
  ): {
    co2: number;
    ch4?: number;
    n2o?: number;
    total: number;
    directEmissions: number;
    indirectEmissions: number;
  };

  /**
   * Build comprehensive calculation result
   */
  protected buildResult(
    activityData: ActivityData,
    emissionFactor: EmissionFactor,
    emissions: any,
    request: CalculationRequest
  ): EmissionCalculationResult {
    const calculationId = this.generateCalculationId();
    const now = new Date();

    return {
      input: {
        activityData,
        emissionFactor,
        calculationMethod: `GLEC_${this.transportMode.toUpperCase()}_v${GLEC_CONSTANTS.VERSION}`
      },
      emissions: {
        co2: emissions.co2,
        ch4: emissions.ch4,
        n2o: emissions.n2o,
        total: emissions.total
      },
      breakdown: {
        directEmissions: emissions.directEmissions,
        indirectEmissions: emissions.indirectEmissions,
        fuelProduction: emissions.fuelProduction || 0,
        fuelTransport: emissions.fuelTransport || 0
      },
      metrics: {
        emissionIntensity: this.calculateIntensity(emissions.total, activityData),
        fuelEfficiency: this.calculateFuelEfficiency(activityData),
        loadUtilization: this.getLoadUtilization(activityData)
      },
      metadata: {
        calculatedAt: now,
        calculationId,
        glecVersion: GLEC_CONSTANTS.VERSION,
        confidence: this.assessConfidence(activityData, emissionFactor),
        assumptions: this.getAssumptions(activityData)
      }
    };
  }

  /**
   * Calculate emission intensity (kg CO2e per functional unit)
   */
  protected calculateIntensity(totalEmissions: number, data: ActivityData): number {
    if (data.weight && data.distance) {
      return totalEmissions / (data.weight * data.distance); // per tkm
    } else if (data.distance) {
      return totalEmissions / data.distance; // per km
    }
    return totalEmissions;
  }

  /**
   * Calculate fuel efficiency
   */
  protected calculateFuelEfficiency(data: ActivityData): number | undefined {
    if (data.fuelConsumed && data.distance) {
      return data.distance / data.fuelConsumed; // km per liter/kWh
    }
    return undefined;
  }

  /**
   * Get actual load utilization
   */
  protected getLoadUtilization(data: ActivityData): number {
    return data.loadFactor || GLEC_CONSTANTS.DEFAULT_LOAD_FACTORS[this.transportMode];
  }

  /**
   * Assess calculation confidence level
   */
  protected assessConfidence(data: ActivityData, factor: EmissionFactor): 'high' | 'medium' | 'low' {
    let score = 0;
    
    // Data quality scoring
    if (data.weight) score += 2;
    if (data.distance) score += 2;
    if (data.loadFactor) score += 1;
    if (data.fuelConsumed) score += 2;
    
    // Factor quality scoring
    if (factor.scope === 'wtw') score += 1;
    if (factor.region) score += 1;
    
    if (score >= 7) return 'high';
    if (score >= 4) return 'medium';
    return 'low';
  }

  /**
   * Get calculation assumptions
   */
  protected getAssumptions(data: ActivityData): string[] {
    const assumptions: string[] = [];
    
    if (!data.loadFactor) {
      assumptions.push(`Load factor assumed: ${GLEC_CONSTANTS.DEFAULT_LOAD_FACTORS[this.transportMode] * 100}%`);
    }
    
    if (!data.emptyReturn) {
      assumptions.push('No empty return trip assumed');
    }
    
    return assumptions;
  }

  /**
   * Generate unique calculation ID
   */
  protected generateCalculationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `${this.transportMode}_${timestamp}_${random}`;
  }

  /**
   * Convert CO2 equivalent using GWP values
   */
  protected convertToCO2e(co2: number, ch4?: number, n2o?: number): number {
    let total = co2 * GLEC_CONSTANTS.GWP.CO2;
    
    if (ch4) total += ch4 * GLEC_CONSTANTS.GWP.CH4;
    if (n2o) total += n2o * GLEC_CONSTANTS.GWP.N2O;
    
    return total;
  }
}

/**
 * Calculator factory for creating mode-specific calculators
 */
export class CalculatorFactory {
  private static calculators: Map<TransportMode, EmissionCalculator> = new Map();

  static getCalculator(mode: TransportMode): EmissionCalculator {
    if (!this.calculators.has(mode)) {
      this.calculators.set(mode, this.createCalculator(mode));
    }
    return this.calculators.get(mode)!;
  }

  private static createCalculator(mode: TransportMode): EmissionCalculator {
    switch (mode) {
      case 'road':
        return new RoadTransportCalculator();
      case 'rail':
        return new RailTransportCalculator();
      case 'sea':
        return new SeaTransportCalculator();
      case 'air':
        return new AirTransportCalculator();
      default:
        throw new Error(`Unsupported transport mode: ${mode}`);
    }
  }
}

// Import calculator implementations (will be created next)
import { RoadTransportCalculator } from './calculators/road-calculator';
import { RailTransportCalculator } from './calculators/rail-calculator';
import { SeaTransportCalculator } from './calculators/sea-calculator';
import { AirTransportCalculator } from './calculators/air-calculator';
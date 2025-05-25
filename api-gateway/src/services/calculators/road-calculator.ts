import { EmissionCalculator } from '../emission-calculator';
import { 
  ActivityData, 
  EmissionFactor, 
  CalculationError,
  FuelType,
  VehicleCategory 
} from '../../../shared/types/glec';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

/**
 * Road Transport Emissions Calculator
 * Implements GLEC Framework v3.1 for road transport
 */
export class RoadTransportCalculator extends EmissionCalculator {
  constructor() {
    super('road');
  }

  /**
   * Validate road transport specific input data
   */
  protected validateInput(data: ActivityData): CalculationError[] {
    const errors: CalculationError[] = [];

    // Basic validation
    if (!data.distance || data.distance <= 0) {
      errors.push({
        code: 'INVALID_DISTANCE',
        message: 'Distance must be provided and greater than 0',
        field: 'distance',
        suggestion: 'Provide distance in kilometers'
      });
    }

    if (!data.vehicle || !data.vehicle.type) {
      errors.push({
        code: 'INVALID_VEHICLE',
        message: 'Vehicle type must be specified',
        field: 'vehicle.type',
        suggestion: 'Use truck, van, car, motorcycle, etc.'
      });
    }

    if (!data.vehicle?.fuelType) {
      errors.push({
        code: 'INVALID_FUEL_TYPE',
        message: 'Fuel type must be specified',
        field: 'vehicle.fuelType',
        suggestion: 'Use diesel, petrol, electric, hybrid, etc.'
      });
    }

    // Weight validation
    if (data.weight !== undefined && data.weight < 0) {
      errors.push({
        code: 'INVALID_WEIGHT',
        message: 'Weight cannot be negative',
        field: 'weight'
      });
    }

    // Load factor validation
    if (data.loadFactor !== undefined && (data.loadFactor < 0 || data.loadFactor > 1)) {
      errors.push({
        code: 'INVALID_LOAD_FACTOR',
        message: 'Load factor must be between 0 and 1',
        field: 'loadFactor',
        suggestion: 'Use decimal format (e.g., 0.7 for 70%)'
      });
    }

    return errors;
  }

  /**
   * Get emission factor for road transport vehicle
   */
  protected async getEmissionFactor(data: ActivityData): Promise<EmissionFactor> {
    try {
      const { data: factors, error } = await supabase
        .from('emission_factors')
        .select('*')
        .eq('transport_mode', 'road')
        .eq('vehicle_type', data.vehicle.type.toLowerCase())
        .eq('fuel_type', data.vehicle.fuelType.toLowerCase());

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      if (!factors || factors.length === 0) {
        // Use default factor for vehicle type
        return this.getDefaultFactor(data.vehicle);
      }

      // Return the most recent factor
      const latestFactor = factors.sort((a, b) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )[0];

      return {
        id: latestFactor.id,
        transportMode: 'road',
        vehicleType: latestFactor.vehicle_type,
        fuelType: latestFactor.fuel_type as FuelType,
        co2Factor: latestFactor.emission_factor_co2,
        ch4Factor: latestFactor.emission_factor_ch4 || 0,
        n2oFactor: latestFactor.emission_factor_n2o || 0,
        unit: latestFactor.unit as any,
        scope: 'wtw',
        source: latestFactor.source,
        version: latestFactor.version,
        region: latestFactor.region,
        updatedAt: new Date(latestFactor.updated_at)
      };

    } catch (error) {
      console.error('Error fetching emission factor:', error);
      return this.getDefaultFactor(data.vehicle);
    }
  }

  /**
   * Get default emission factor when database lookup fails
   */
  private getDefaultFactor(vehicle: VehicleCategory): EmissionFactor {
    // GLEC Framework v3.1 default factors for road transport
    const defaultFactors: Record<string, { co2: number; unit: string }> = {
      'truck': { co2: 0.079, unit: 'km' },      // kg CO2e/km for medium truck
      'van': { co2: 0.195, unit: 'km' },        // kg CO2e/km
      'car': { co2: 0.171, unit: 'km' },        // kg CO2e/km average
      'motorcycle': { co2: 0.084, unit: 'km' }, // kg CO2e/km
      'heavy_truck': { co2: 0.125, unit: 'km' }, // kg CO2e/km
      'light_truck': { co2: 0.065, unit: 'km' }
    };

    const factorData = defaultFactors[vehicle.type.toLowerCase()] || defaultFactors['truck'];
    
    return {
      id: 'default_road',
      transportMode: 'road',
      vehicleType: vehicle.type,
      fuelType: vehicle.fuelType,
      co2Factor: factorData.co2,
      unit: factorData.unit as any,
      scope: 'wtw',
      source: 'GLEC Framework v3.1 - Default Values',
      version: '3.1',
      updatedAt: new Date()
    };
  }

  /**
   * Normalize activity data for road transport
   */
  protected normalizeActivityData(data: ActivityData): ActivityData {
    const normalized = { ...data };

    // Apply default load factor if not provided
    if (!normalized.loadFactor) {
      normalized.loadFactor = this.getDefaultLoadFactor(data.vehicle.type);
    }

    // Normalize vehicle type names
    if (normalized.vehicle) {
      normalized.vehicle = {
        ...normalized.vehicle,
        type: this.normalizeVehicleType(normalized.vehicle.type)
      };
    }

    return normalized;
  }

  /**
   * Get default load factor by vehicle type
   */
  private getDefaultLoadFactor(vehicleType: string): number {
    const loadFactors: Record<string, number> = {
      'truck': 0.7,
      'van': 0.6,
      'car': 1.0,
      'motorcycle': 1.0,
      'heavy_truck': 0.75,
      'light_truck': 0.65
    };

    return loadFactors[vehicleType.toLowerCase()] || 0.7;
  }

  /**
   * Normalize vehicle type names
   */
  private normalizeVehicleType(vehicleType: string): string {
    const typeMap: Record<string, string> = {
      'truck': 'truck',
      'lorry': 'truck',
      'van': 'van',
      'car': 'car',
      'automobile': 'car',
      'motorcycle': 'motorcycle',
      'motorbike': 'motorcycle',
      'heavy_truck': 'heavy_truck',
      'heavy_goods_vehicle': 'heavy_truck',
      'hgv': 'heavy_truck',
      'light_truck': 'light_truck',
      'light_goods_vehicle': 'light_truck',
      'lgv': 'light_truck'
    };

    return typeMap[vehicleType.toLowerCase()] || vehicleType;
  }

  /**
   * Calculate road transport emissions
   */
  protected calculateEmissions(
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
  } {
    const distance = data.distance!;
    const loadFactor = data.loadFactor || 0.7;
    
    // Base emissions calculation
    let baseEmissions: number;
    
    if (factor.unit === 'km') {
      // Direct distance-based calculation
      baseEmissions = distance * factor.co2Factor;
    } else if (factor.unit === 'tkm' && data.weight) {
      // Tonne-kilometer based calculation
      baseEmissions = distance * data.weight * factor.co2Factor;
    } else {
      // Fallback to distance-based
      baseEmissions = distance * factor.co2Factor;
    }

    // Apply load factor (higher load factor = lower emissions per unit cargo)
    const loadAdjustedEmissions = baseEmissions / Math.max(loadFactor, 0.1);

    // Handle empty return trip
    const totalEmissions = data.emptyReturn ? 
      loadAdjustedEmissions * 1.5 : // 50% increase for empty return
      loadAdjustedEmissions;

    // Well-to-Wheel breakdown (estimates based on fuel type)
    const { directEmissions, indirectEmissions } = this.calculateWTWBreakdown(
      totalEmissions, 
      data.vehicle.fuelType
    );

    // Calculate other GHGs (CH4, N2O) if factors available
    const ch4Emissions = factor.ch4Factor ? 
      (distance * factor.ch4Factor * loadFactor) : undefined;
    const n2oEmissions = factor.n2oFactor ? 
      (distance * factor.n2oFactor * loadFactor) : undefined;

    // Total CO2 equivalent
    const totalCO2e = this.convertToCO2e(totalEmissions, ch4Emissions, n2oEmissions);

    return {
      co2: totalEmissions,
      ch4: ch4Emissions,
      n2o: n2oEmissions,
      total: totalCO2e,
      directEmissions,
      indirectEmissions
    };
  }

  /**
   * Calculate Well-to-Wheel emissions breakdown
   */
  private calculateWTWBreakdown(totalEmissions: number, fuelType: FuelType): {
    directEmissions: number;
    indirectEmissions: number;
  } {
    // WTW ratios based on GLEC Framework v3.1
    const wtwRatios: Record<FuelType, { direct: number; indirect: number }> = {
      diesel: { direct: 0.74, indirect: 0.26 },      // Tank-to-wheel: 74%, Well-to-tank: 26%
      petrol: { direct: 0.76, indirect: 0.24 },
      electric: { direct: 0.0, indirect: 1.0 },      // All emissions from electricity generation
      hybrid: { direct: 0.5, indirect: 0.5 },        // Mixed approach
      biodiesel: { direct: 0.8, indirect: 0.2 },
      hfo: { direct: 0.72, indirect: 0.28 },
      mgo: { direct: 0.73, indirect: 0.27 },
      lng: { direct: 0.8, indirect: 0.2 },
      jet_fuel: { direct: 0.75, indirect: 0.25 },
      hydrogen: { direct: 0.0, indirect: 1.0 }
    };

    const ratios = wtwRatios[fuelType] || wtwRatios.diesel;
    
    return {
      directEmissions: totalEmissions * ratios.direct,
      indirectEmissions: totalEmissions * ratios.indirect
    };
  }

  /**
   * Additional road-specific assumptions
   */
  protected getAssumptions(data: ActivityData): string[] {
    const assumptions = super.getAssumptions(data);

    if (!data.routeType) {
      assumptions.push('Mixed highway/urban route assumed');
    }

    if (data.vehicle.type === 'truck' && !data.vehicle.capacity) {
      assumptions.push('Medium truck capacity assumed');
    }

    if (!data.fuelConsumed) {
      assumptions.push('Standard fuel efficiency assumed for vehicle type');
    }

    return assumptions;
  }
}
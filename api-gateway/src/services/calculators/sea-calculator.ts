import { EmissionCalculator } from '../emission-calculator';
import { ActivityData, EmissionFactor, CalculationError, FuelType } from '../../../shared/types/glec';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

/**
 * Sea Transport Emissions Calculator
 * Implements GLEC Framework v3.1 for maritime transport
 */
export class SeaTransportCalculator extends EmissionCalculator {
  constructor() {
    super('sea');
  }

  protected validateInput(data: ActivityData): CalculationError[] {
    const errors: CalculationError[] = [];

    if (!data.distance || data.distance <= 0) {
      errors.push({
        code: 'INVALID_DISTANCE',
        message: 'Distance must be provided and greater than 0',
        field: 'distance'
      });
    }

    if (!data.weight || data.weight <= 0) {
      errors.push({
        code: 'INVALID_WEIGHT',
        message: 'Weight (cargo tonnage) must be provided for sea transport',
        field: 'weight'
      });
    }

    return errors;
  }

  protected async getEmissionFactor(data: ActivityData): Promise<EmissionFactor> {
    try {
      const { data: factors, error } = await supabase
        .from('emission_factors')
        .select('*')
        .eq('transport_mode', 'sea');

      if (!error && factors && factors.length > 0) {
        const factor = factors[0];
        return {
          id: factor.id,
          transportMode: 'sea',
          vehicleType: factor.vehicle_type,
          fuelType: factor.fuel_type as FuelType,
          co2Factor: factor.emission_factor_co2,
          unit: factor.unit as any,
          scope: 'wtw',
          source: factor.source,
          version: factor.version,
          updatedAt: new Date(factor.updated_at)
        };
      }
    } catch (error) {
      console.error('Error fetching sea emission factor:', error);
    }

    return {
      id: 'default_sea',
      transportMode: 'sea',
      vehicleType: 'container_ship',
      fuelType: 'hfo',
      co2Factor: 0.011, // kg CO2e per tkm
      unit: 'tkm',
      scope: 'wtw',
      source: 'GLEC Framework v3.1 - Default Values',
      version: '3.1',
      updatedAt: new Date()
    };
  }

  protected normalizeActivityData(data: ActivityData): ActivityData {
    return { ...data, loadFactor: data.loadFactor || 0.85 };
  }

  protected calculateEmissions(data: ActivityData, factor: EmissionFactor): any {
    const distance = data.distance!;
    const weight = data.weight!;
    const tonneKm = distance * weight;
    
    const baseEmissions = tonneKm * factor.co2Factor;
    const loadFactor = data.loadFactor || 0.85;
    const adjustedEmissions = baseEmissions / loadFactor;

    return {
      co2: adjustedEmissions,
      total: adjustedEmissions,
      directEmissions: adjustedEmissions * 0.72,
      indirectEmissions: adjustedEmissions * 0.28
    };
  }
}

/**
 * Air Transport Emissions Calculator  
 * Implements GLEC Framework v3.1 for aviation transport
 */
export class AirTransportCalculator extends EmissionCalculator {
  constructor() {
    super('air');
  }

  protected validateInput(data: ActivityData): CalculationError[] {
    const errors: CalculationError[] = [];

    if (!data.distance || data.distance <= 0) {
      errors.push({
        code: 'INVALID_DISTANCE',
        message: 'Distance must be provided and greater than 0',
        field: 'distance'
      });
    }

    if (!data.weight || data.weight <= 0) {
      errors.push({
        code: 'INVALID_WEIGHT',
        message: 'Weight (cargo tonnage) must be provided for air transport',
        field: 'weight'
      });
    }

    return errors;
  }

  protected async getEmissionFactor(data: ActivityData): Promise<EmissionFactor> {
    try {
      const { data: factors, error } = await supabase
        .from('emission_factors')
        .select('*')
        .eq('transport_mode', 'air');

      if (!error && factors && factors.length > 0) {
        const factor = factors[0];
        return {
          id: factor.id,
          transportMode: 'air',
          vehicleType: factor.vehicle_type,
          fuelType: factor.fuel_type as FuelType,
          co2Factor: factor.emission_factor_co2,
          unit: factor.unit as any,
          scope: 'wtw',
          source: factor.source,
          version: factor.version,
          updatedAt: new Date(factor.updated_at)
        };
      }
    } catch (error) {
      console.error('Error fetching air emission factor:', error);
    }

    return {
      id: 'default_air',
      transportMode: 'air',
      vehicleType: 'cargo_plane',
      fuelType: 'jet_fuel',
      co2Factor: 0.602, // kg CO2e per tkm
      unit: 'tkm',
      scope: 'wtw',
      source: 'GLEC Framework v3.1 - Default Values',
      version: '3.1',
      updatedAt: new Date()
    };
  }

  protected normalizeActivityData(data: ActivityData): ActivityData {
    return { ...data, loadFactor: data.loadFactor || 0.8 };
  }

  protected calculateEmissions(data: ActivityData, factor: EmissionFactor): any {
    const distance = data.distance!;
    const weight = data.weight!;
    const tonneKm = distance * weight;
    
    // Include Radiative Forcing Index (RFI) for aviation
    const rfi = 1.9; // GLEC Framework multiplier for aviation
    const baseEmissions = tonneKm * factor.co2Factor * rfi;
    
    const loadFactor = data.loadFactor || 0.8;
    const adjustedEmissions = baseEmissions / loadFactor;

    return {
      co2: adjustedEmissions,
      total: adjustedEmissions,
      directEmissions: adjustedEmissions * 0.75,
      indirectEmissions: adjustedEmissions * 0.25
    };
  }
}
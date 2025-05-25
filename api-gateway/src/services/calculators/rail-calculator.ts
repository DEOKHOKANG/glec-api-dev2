import { EmissionCalculator } from '../emission-calculator';
import { ActivityData, EmissionFactor, CalculationError, FuelType } from '../../../shared/types/glec';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

/**
 * Rail Transport Emissions Calculator
 * Implements GLEC Framework v3.1 for rail transport
 */
export class RailTransportCalculator extends EmissionCalculator {
  constructor() {
    super('rail');
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
        message: 'Weight (cargo tonnage) must be provided for rail transport',
        field: 'weight',
        suggestion: 'Provide cargo weight in tonnes'
      });
    }

    return errors;
  }

  protected async getEmissionFactor(data: ActivityData): Promise<EmissionFactor> {
    try {
      const { data: factors, error } = await supabase
        .from('emission_factors')
        .select('*')
        .eq('transport_mode', 'rail')
        .eq('fuel_type', data.vehicle?.fuelType || 'electric');

      if (!error && factors && factors.length > 0) {
        const factor = factors[0];
        return {
          id: factor.id,
          transportMode: 'rail',
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
      console.error('Error fetching rail emission factor:', error);
    }

    // Default factor for electric freight train
    return {
      id: 'default_rail',
      transportMode: 'rail',
      vehicleType: 'freight_train',
      fuelType: 'electric',
      co2Factor: 0.028, // kg CO2e per tkm
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
    
    const baseEmissions = tonneKm * factor.co2Factor;
    const loadFactor = data.loadFactor || 0.8;
    const adjustedEmissions = baseEmissions / loadFactor;

    return {
      co2: adjustedEmissions,
      total: adjustedEmissions,
      directEmissions: adjustedEmissions * 0.1, // Most rail is electric
      indirectEmissions: adjustedEmissions * 0.9
    };
  }
}
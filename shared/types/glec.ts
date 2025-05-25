/**
 * GLEC Framework v3.1 Types and Interfaces
 * Global Logistics Emissions Council Framework for Logistics Emissions Accounting and Reporting
 */

// Transport Modes supported by GLEC Framework
export type TransportMode = 'road' | 'rail' | 'sea' | 'air';

// Energy/Fuel Types
export type FuelType = 
  | 'diesel' 
  | 'petrol' 
  | 'electric' 
  | 'hybrid'
  | 'hfo'        // Heavy Fuel Oil (marine)
  | 'mgo'        // Marine Gas Oil
  | 'lng'        // Liquefied Natural Gas
  | 'jet_fuel'   // Jet A-1 for aviation
  | 'biodiesel'
  | 'hydrogen';

// Vehicle/Asset Categories
export interface VehicleCategory {
  type: string;
  subType?: string;
  capacity?: {
    weight?: number;    // tonnes
    volume?: number;    // cubic meters
    passengers?: number;
  };
  fuelType: FuelType;
}

// Activity Data Input (what user provides)
export interface ActivityData {
  transportMode: TransportMode;
  vehicle: VehicleCategory;
  
  // Trip Information
  distance?: number;           // km
  weight?: number;            // tonnes of cargo
  volume?: number;            // cubic meters of cargo
  
  // Load Factor Information
  loadFactor?: number;        // 0-1 (percentage utilization)
  emptyReturn?: boolean;      // return trip empty
  
  // Route specific
  origin?: string;
  destination?: string;
  routeType?: 'highway' | 'urban' | 'mixed' | 'international';
  
  // Energy consumption (if available)
  fuelConsumed?: number;      // liters or kWh
  energyUnit?: 'liters' | 'kwh' | 'kg';
}

// Emission Factors (from database)
export interface EmissionFactor {
  id: string;
  transportMode: TransportMode;
  vehicleType: string;
  fuelType: FuelType;
  
  // WTW Emission Factors (Well-to-Wheel)
  co2Factor: number;          // kg CO2e per unit
  ch4Factor?: number;         // kg CH4 per unit  
  n2oFactor?: number;         // kg N2O per unit
  
  // Factor units and scope
  unit: 'km' | 'tkm' | 'kg_fuel' | 'kwh';
  scope: 'ttw' | 'wtw';       // Tank-to-Wheel or Well-to-Wheel
  
  // Reference data
  source: string;
  version: string;
  region?: string;
  updatedAt: Date;
}

// Calculation Results
export interface EmissionCalculationResult {
  // Input data summary
  input: {
    activityData: ActivityData;
    emissionFactor: EmissionFactor;
    calculationMethod: string;
  };
  
  // Emission results (kg CO2e)
  emissions: {
    co2: number;
    ch4?: number;
    n2o?: number;
    total: number;              // Total CO2 equivalent
  };
  
  // Breakdown by emission source
  breakdown: {
    directEmissions: number;    // Tank-to-Wheel
    indirectEmissions: number;  // Well-to-Tank
    fuelProduction?: number;
    fuelTransport?: number;
  };
  
  // Performance metrics
  metrics: {
    emissionIntensity: number;  // kg CO2e per unit (tkm, pkm, etc.)
    fuelEfficiency?: number;    // km per liter or kWh per km
    loadUtilization: number;    // actual load factor used
  };
  
  // Calculation metadata
  metadata: {
    calculatedAt: Date;
    calculationId: string;
    glecVersion: string;
    confidence: 'high' | 'medium' | 'low';
    assumptions: string[];
  };
}

// Calculation Request
export interface CalculationRequest {
  activityData: ActivityData;
  options?: {
    includeIndirectEmissions?: boolean;
    customEmissionFactor?: Partial<EmissionFactor>;
    roundingPrecision?: number;
    includeBiogenic?: boolean;
  };
}

// Batch Calculation for multiple trips
export interface BatchCalculationRequest {
  calculations: CalculationRequest[];
  options?: {
    aggregateResults?: boolean;
    includeDetailedBreakdown?: boolean;
  };
}

export interface BatchCalculationResult {
  individual: EmissionCalculationResult[];
  aggregate?: {
    totalEmissions: number;
    averageIntensity: number;
    totalDistance: number;
    totalWeight: number;
  };
}

// Error types for validation
export interface CalculationError {
  code: string;
  message: string;
  field?: string;
  suggestion?: string;
}

// Unit conversion utilities
export interface UnitConversion {
  fromUnit: string;
  toUnit: string;
  factor: number;
  category: 'distance' | 'weight' | 'volume' | 'energy';
}

// GLEC Framework constants
export const GLEC_CONSTANTS = {
  VERSION: '3.1',
  
  // GWP (Global Warming Potential) values for 100-year horizon
  GWP: {
    CO2: 1,
    CH4: 28,      // IPCC AR5 values
    N2O: 265
  },
  
  // Standard units
  UNITS: {
    DISTANCE: 'km',
    WEIGHT: 'tonnes',
    VOLUME: 'm3',
    EMISSIONS: 'kg_co2e'
  },
  
  // Default load factors by transport mode
  DEFAULT_LOAD_FACTORS: {
    road: 0.7,
    rail: 0.8,
    sea: 0.85,
    air: 0.8
  }
} as const;
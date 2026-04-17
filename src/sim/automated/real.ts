/**
 * Non-financial state for the labour-only automated model (no capital or inventories yet).
 */

export type RealEconomyState = {
  // Maximum employment (in labour units)
  labourForce: number;
  // Actual employment (in labour units)
  employment: number;
  // Output units per worker per period.
  labourProductivity: number;
  // Money units per labour unit.
  moneyWage: number;
  // Money units per output unit.
  priceLevel: number;
  // Firms’ demand expectation (units of output).
  expectedSales: number;
  // Production in the last period (units of output).
  lastPeriodOutput: number;
  // Consumption in the last period (output units).
  lastPeriodConsumption: number;
  // Wage bill in the last period (money units)
  lastPeriodWageBill: number;
};

export const DEFAULT_REAL_ECONOMY_STATE: RealEconomyState = {
  labourForce: 100,
  employment: 0,
  labourProductivity: 1,
  moneyWage: 100,
  priceLevel: 100,
  expectedSales: 80,
  lastPeriodOutput: 0,
  lastPeriodConsumption: 0,
  lastPeriodWageBill: 0,
};

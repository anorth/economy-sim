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
};

export type RealEconomyMetrics = {
  // Production in the last period (units of output).
  lastPeriodOutput: number;
  // Consumption in the last period (output units).
  lastPeriodConsumption: number;
  // Wage bill in the last period (money units)
  lastPeriodWageBill: number;
  // Interest paid by firms in the last period (money units).
  lastInterestPayment: number;
  // Expected sales revenue considered by firms when planning this period.
  lastExpectedRevenue: number;
  // Expected wage plus interest outlays considered by firms when planning this period.
  lastExpectedOutlays: number;
  // Coverage ratio = expected revenue / expected outlays used in the planning step.
  lastCoverageRatio: number;
  // Expected sales after optimism and coverage adjustment, before the period is executed.
  lastPlannedExpectedSales: number;
};

export const DEFAULT_REAL_ECONOMY_STATE: RealEconomyState = {
  labourForce: 100,
  employment: 0,
  labourProductivity: 1,
  moneyWage: 100,
  priceLevel: 100,
  expectedSales: 95,
};

export const DEFAULT_REAL_ECONOMY_METRICS: RealEconomyMetrics = {
  lastPeriodOutput: 0,
  lastPeriodConsumption: 0,
  lastPeriodWageBill: 0,
  lastInterestPayment: 0,
  lastExpectedRevenue: 0,
  lastExpectedOutlays: 0,
  lastCoverageRatio: 1,
  lastPlannedExpectedSales: 0,
};

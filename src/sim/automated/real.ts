/**
 * Non-financial state for the labour-only automated model (no capital or inventories yet).
 */

export type RealEconomyState = {
  labourForce: number;
  employment: number;
  moneyWage: number;
  /** Output per worker per period at fixed implicit price = 1. */
  labourProductivity: number;
  /** Firms’ demand expectation (units of output). */
  expectedSales: number;
  lastPeriodOutput: number;
  lastPeriodConsumption: number;
  lastPeriodWageBill: number;
};

export const DEFAULT_REAL_ECONOMY_STATE: RealEconomyState = {
  labourForce: 100,
  employment: 0,
  moneyWage: 1,
  labourProductivity: 1,
  expectedSales: 80,
  lastPeriodOutput: 0,
  lastPeriodConsumption: 0,
  lastPeriodWageBill: 0,
};

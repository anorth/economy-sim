/**
 * User-editable policy for the phase-1 labour-only automated model.
 */

export type LabourPhase1Policy = {
  /** Treasury fiat spend to household deposits per period (0 = none). */
  fiatSpendToHouseholdsPerPeriod: number;
  /** If true, firms borrow the shortfall so payroll can clear. */
  autoBorrowForPayroll: boolean;
  /** Interest charged on outstanding firm loans each period. */
  firmLoanInterestRate: number;
  /** Tax rate 0–1 applied to gross wage bill (withheld from households). */
  householdIncomeTaxRate: number;
  /** Fraction of pre-income household deposits spent on goods each period (0–1). */
  consumptionPropensityFromWealth: number;
  /** Fraction of current disposable employment income spent on goods each period (0–1). */
  consumptionPropensityFromIncome: number;
  /** Blend factor for lagged adaptive expected sales: (1-a)*expected + a*previousConsumption. */
  salesExpectationAdaptation: number;
  /** Baseline expected sales growth attempted each period before the coverage check. */
  baselineExpectedSalesGrowth: number;
  /** Employment rate above which wages begin rising. */
  wagePressureThreshold: number;
  /** Weekly wage-growth sensitivity per point of employment-rate tightness above the threshold. */
  wagePressureSensitivity: number;
};

export const DEFAULT_LABOUR_PHASE1_POLICY: LabourPhase1Policy = {
  fiatSpendToHouseholdsPerPeriod: 0,
  autoBorrowForPayroll: true,
  firmLoanInterestRate: 0.07 / 52,
  householdIncomeTaxRate: 0,
  consumptionPropensityFromWealth: 0.05,
  consumptionPropensityFromIncome: 0.95,
  salesExpectationAdaptation: 0.3,
  baselineExpectedSalesGrowth: 0.05 / 52,
  wagePressureThreshold: 0.95,
  wagePressureSensitivity: (0.1 / 52) / (1 - 0.95),
};

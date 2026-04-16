/**
 * User-editable policy for the phase-1 labour-only automated model.
 */

export type LabourPhase1Policy = {
  /** Treasury fiat spend to household deposits per period (0 = none). */
  fiatSpendToHouseholdsPerPeriod: number;
  /** If true, firms borrow the shortfall so payroll can clear. */
  autoBorrowForPayroll: boolean;
  /** Tax rate 0–1 applied to gross wage bill (withheld from households). */
  householdIncomeTaxRate: number;
  /** Fraction of household deposit balance spent on goods each period (0–1). */
  consumptionPropensityFromDeposits: number;
  /** Blend factor for adaptive expected sales: (1-a)*expected + a*lastConsumption. */
  salesExpectationAdaptation: number;
};

export const DEFAULT_LABOUR_PHASE1_POLICY: LabourPhase1Policy = {
  fiatSpendToHouseholdsPerPeriod: 0,
  autoBorrowForPayroll: true,
  householdIncomeTaxRate: 0.1,
  consumptionPropensityFromDeposits: 0.75,
  salesExpectationAdaptation: 0.3,
};

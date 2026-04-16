import { applyAction, type SimAction } from "../events";
import { clonePostings, balance, type AccountPostings } from "../postings";
import type { FinancialSimulationState } from "../simulation";
import type { LabourPhase1Policy } from "./policy";
import type { RealEconomyState } from "./real";

export type LabourPhase1PlanResult = {
  actions: SimAction[];
  nextReal: RealEconomyState;
};

/**
 * Build one period’s action batch using sequential “what-if” posting so consumption
 * reflects deposits after wages and taxes.
 */
export function planLabourPhase1Period(
  financial: FinancialSimulationState,
  real: RealEconomyState,
  policy: LabourPhase1Policy
): LabourPhase1PlanResult {
  const postings = clonePostings(
    financial.history[financial.history.length - 1]!
  ) as AccountPostings;
  const actions: SimAction[] = [];

  if (policy.fiatSpendToHouseholdsPerPeriod > 0) {
    const a = {
      type: "fiatSpend" as const,
      amount: policy.fiatSpendToHouseholdsPerPeriod,
      to: "households" as const,
    };
    actions.push(a);
    applyAction(postings, a);
  }

  const productivity = real.labourProductivity;
  const N = Math.min(
    real.labourForce,
    Math.max(0, real.expectedSales / Math.max(productivity, 1e-12))
  );
  const W = N * real.moneyWage;

  const firmDep = balance(postings, "firms.deposits");
  if (policy.autoBorrowForPayroll && W > 0 && firmDep < W) {
    const need = W - firmDep;
    const loan = { type: "bankLoanFirms" as const, amount: need };
    actions.push(loan);
    applyAction(postings, loan);
  }

  if (W > 0) {
    const w = { type: "payWages" as const, amount: W };
    actions.push(w);
    applyAction(postings, w);
  }

  const T = W * policy.householdIncomeTaxRate;
  if (T > 0) {
    const tx = { type: "tax" as const, amount: T, from: "households" as const };
    actions.push(tx);
    applyAction(postings, tx);
  }

  const hhDep = balance(postings, "hh.deposits");
  const prop = Math.min(1, Math.max(0, policy.consumptionPropensityFromDeposits));
  const C = Math.max(0, Math.min(hhDep, hhDep * prop));
  if (C > 0) {
    const c = { type: "householdConsumption" as const, amount: C };
    actions.push(c);
    applyAction(postings, c);
  }

  const output = N * productivity;
  const adapt = Math.min(1, Math.max(0, policy.salesExpectationAdaptation));
  const nextExpected =
    (1 - adapt) * real.expectedSales + adapt * C;

  return {
    actions,
    nextReal: {
      ...real,
      employment: N,
      lastPeriodOutput: output,
      lastPeriodConsumption: C,
      lastPeriodWageBill: W,
      expectedSales: nextExpected,
    },
  };
}

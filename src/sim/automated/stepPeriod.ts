import { applyAction, type SimAction } from "../events";
import { clonePostings, balance, type AccountPostings } from "../postings";
import type { FinancialSimulationState } from "../simulation";
import type { LabourPhase1Policy } from "./policy";
import type { RealEconomyMetrics, RealEconomyState } from "./real";

export type LabourPhase1PlanResult = {
  actions: SimAction[];
  nextReal: RealEconomyState;
  metrics: RealEconomyMetrics;
};

/**
 * Build one period’s action batch using sequential “what-if” posting so consumption
 * reflects deposits after wages and taxes.
 */
export function planLabourPhase1Period(
  financial: FinancialSimulationState,
  real: RealEconomyState,
  prevMetrics: RealEconomyMetrics,
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

  const householdWealthMoney = balance(postings, "hh.deposits");
  const productivity = Math.max(real.labourProductivity, 1e-12);
  const priceLevel = Math.max(real.priceLevel, 1e-12);
  const debt = balance(postings, "firms.loans");
  const interestDue = debt * Math.max(0, policy.firmLoanInterestRate);
  const currentEmploymentRate =
    real.labourForce > 0 ? real.employment / real.labourForce : 0;
  const wageGrowth =
    Math.max(0, currentEmploymentRate - policy.wagePressureThreshold) *
    Math.max(0, policy.wagePressureSensitivity);
  const nextMoneyWage = real.moneyWage * (1 + wageGrowth);
  const laggedConsumptionSignal =
    prevMetrics.lastPeriodConsumption > 0 ? prevMetrics.lastPeriodConsumption : real.expectedSales;
  const adapt = Math.min(1, Math.max(0, policy.salesExpectationAdaptation));
  const adaptiveExpectedSales =
    (1 - adapt) * real.expectedSales + adapt * laggedConsumptionSignal;
  const optimisticExpectedSales =
    adaptiveExpectedSales * (1 + Math.max(0, policy.baselineExpectedSalesGrowth));
  const optimisticEmployment = Math.min(
    real.labourForce,
    Math.max(0, optimisticExpectedSales / productivity)
  );
  const optimisticOutput = Math.max(
    0,
    Math.min(optimisticExpectedSales, optimisticEmployment * productivity)
  );
  const expectedRevenue = optimisticOutput * priceLevel;
  const expectedWageBill = optimisticEmployment * nextMoneyWage;
  const expectedOutlays = expectedWageBill + interestDue;
  const coverage = expectedOutlays > 0 ? expectedRevenue / expectedOutlays : 1;
  const plannedExpectedSales = Math.max(
    0,
    optimisticExpectedSales * Math.min(1, Math.max(0, coverage))
  );
  const output = Math.max(
    0,
    Math.min(
      plannedExpectedSales,
      Math.min(real.labourForce, Math.max(0, plannedExpectedSales / productivity)) * productivity
    )
  );
  const N = Math.min(real.labourForce, Math.max(0, plannedExpectedSales / productivity));
  const W = N * nextMoneyWage;

  const firmDep = balance(postings, "firms.deposits");
  const operatingCashNeed = W + interestDue;
  if (policy.autoBorrowForPayroll && operatingCashNeed > 0 && firmDep < operatingCashNeed) {
    const need = operatingCashNeed - firmDep;
    const loan = { type: "bankLoanFirms" as const, amount: need };
    actions.push(loan);
    applyAction(postings, loan);
  }

  if (W > 0) {
    const w = { type: "payWages" as const, amount: W };
    actions.push(w);
    applyAction(postings, w);
  }

  if (interestDue > 0) {
    const interest = { type: "payLoanInterestFirms" as const, amount: interestDue };
    actions.push(interest);
    applyAction(postings, interest);
  }

  const T = W * policy.householdIncomeTaxRate;
  const disposableEmploymentIncome = Math.max(0, W - T);
  if (T > 0) {
    const tx = { type: "tax" as const, amount: T, from: "households" as const };
    actions.push(tx);
    applyAction(postings, tx);
  }

  const hhDep = balance(postings, "hh.deposits");
  const wealthProp = Math.min(1, Math.max(0, policy.consumptionPropensityFromWealth));
  const incomeProp = Math.min(1, Math.max(0, policy.consumptionPropensityFromIncome));
  const desiredConsumptionMoney = Math.max(
    0,
    Math.min(
      hhDep,
      householdWealthMoney * wealthProp + disposableEmploymentIncome * incomeProp
    )
  );
  const desiredConsumptionReal = desiredConsumptionMoney / priceLevel;
  const actualConsumptionReal = Math.max(0, Math.min(output, desiredConsumptionReal));
  const actualConsumptionMoney = actualConsumptionReal * priceLevel;
  if (actualConsumptionMoney > 0) {
    const c = { type: "householdConsumption" as const, amount: actualConsumptionMoney };
    actions.push(c);
    applyAction(postings, c);
  }

  return {
    actions,
    nextReal: {
      labourForce: real.labourForce,
      employment: N,
      labourProductivity: real.labourProductivity,
      moneyWage: nextMoneyWage,
      priceLevel: real.priceLevel,
      expectedSales: plannedExpectedSales,
    },
    metrics: {
      lastPeriodOutput: output,
      lastPeriodConsumption: actualConsumptionReal,
      lastPeriodWageBill: W,
      lastInterestPayment: interestDue,
      lastExpectedRevenue: expectedRevenue,
      lastExpectedOutlays: expectedOutlays,
      lastCoverageRatio: coverage,
      lastPlannedExpectedSales: plannedExpectedSales,
    },
  };
}

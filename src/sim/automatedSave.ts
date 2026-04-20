/**
 * Browser persistence for the automated labour-only simulation (financial + real + policy).
 */

import type { AutomatedSimulationState } from "./automated/state";
import { hydrateFinancialSimulationState } from "./saveGame";
import type { LabourPhase1Policy } from "./automated/policy";
import { DEFAULT_LABOUR_PHASE1_POLICY } from "./automated/policy";
import type { RealEconomyMetrics, RealEconomyState } from "./automated/real";
import { DEFAULT_REAL_ECONOMY_METRICS, DEFAULT_REAL_ECONOMY_STATE } from "./automated/real";

export const AUTOMATED_SAVE_FORMAT_VERSION = 1 as const;

export const AUTOMATED_SLOT_ID = "automated-labour-v1" as const;

const PREFIX = "economy-sim:v1:automated:";

export function automatedSaveStorageKey(slotId: string): string {
  return `${PREFIX}${slotId}`;
}

export type AutomatedSaveEnvelopeV1 = {
  formatVersion: typeof AUTOMATED_SAVE_FORMAT_VERSION;
  slotId: string;
  savedAt: string;
  state: AutomatedSimulationState;
};

function normalizeRealEconomyState(raw: unknown): RealEconomyState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_REAL_ECONOMY_STATE };
  const o = raw as Record<string, unknown>;
  const num = (k: string, d: number) =>
    typeof o[k] === "number" && Number.isFinite(o[k] as number) ? (o[k] as number) : d;
  return {
    labourForce: num("labourForce", DEFAULT_REAL_ECONOMY_STATE.labourForce),
    employment: num("employment", DEFAULT_REAL_ECONOMY_STATE.employment),
    moneyWage: num("moneyWage", DEFAULT_REAL_ECONOMY_STATE.moneyWage),
    priceLevel: num("priceLevel", DEFAULT_REAL_ECONOMY_STATE.priceLevel),
    labourProductivity: num("labourProductivity", DEFAULT_REAL_ECONOMY_STATE.labourProductivity),
    expectedSales: num("expectedSales", DEFAULT_REAL_ECONOMY_STATE.expectedSales),
  };
}

function normalizeRealEconomyMetrics(raw: unknown): RealEconomyMetrics {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_REAL_ECONOMY_METRICS };
  const o = raw as Record<string, unknown>;
  const num = (k: string, d: number) =>
    typeof o[k] === "number" && Number.isFinite(o[k] as number) ? (o[k] as number) : d;
  return {
    lastPeriodOutput: num("lastPeriodOutput", DEFAULT_REAL_ECONOMY_METRICS.lastPeriodOutput),
    lastPeriodConsumption: num(
      "lastPeriodConsumption",
      DEFAULT_REAL_ECONOMY_METRICS.lastPeriodConsumption
    ),
    lastPeriodWageBill: num("lastPeriodWageBill", DEFAULT_REAL_ECONOMY_METRICS.lastPeriodWageBill),
    lastInterestPayment: num(
      "lastInterestPayment",
      DEFAULT_REAL_ECONOMY_METRICS.lastInterestPayment
    ),
    lastExpectedRevenue: num(
      "lastExpectedRevenue",
      DEFAULT_REAL_ECONOMY_METRICS.lastExpectedRevenue
    ),
    lastExpectedOutlays: num(
      "lastExpectedOutlays",
      DEFAULT_REAL_ECONOMY_METRICS.lastExpectedOutlays
    ),
    lastCoverageRatio: num(
      "lastCoverageRatio",
      DEFAULT_REAL_ECONOMY_METRICS.lastCoverageRatio
    ),
    lastPlannedExpectedSales: num(
      "lastPlannedExpectedSales",
      DEFAULT_REAL_ECONOMY_METRICS.lastPlannedExpectedSales
    ),
  };
}

function normalizePolicy(raw: unknown): LabourPhase1Policy {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_LABOUR_PHASE1_POLICY };
  const o = raw as Record<string, unknown>;
  const num = (k: string, d: number) =>
    typeof o[k] === "number" && Number.isFinite(o[k] as number) ? (o[k] as number) : d;
  return {
    fiatSpendToHouseholdsPerPeriod: num(
      "fiatSpendToHouseholdsPerPeriod",
      DEFAULT_LABOUR_PHASE1_POLICY.fiatSpendToHouseholdsPerPeriod
    ),
    autoBorrowForPayroll:
      typeof o.autoBorrowForPayroll === "boolean"
        ? o.autoBorrowForPayroll
        : DEFAULT_LABOUR_PHASE1_POLICY.autoBorrowForPayroll,
    firmLoanInterestRate: num(
      "firmLoanInterestRate",
      DEFAULT_LABOUR_PHASE1_POLICY.firmLoanInterestRate
    ),
    householdIncomeTaxRate: num(
      "householdIncomeTaxRate",
      DEFAULT_LABOUR_PHASE1_POLICY.householdIncomeTaxRate
    ),
    consumptionPropensityFromWealth: num(
      "consumptionPropensityFromWealth",
      DEFAULT_LABOUR_PHASE1_POLICY.consumptionPropensityFromWealth
    ),
    consumptionPropensityFromIncome: num(
      "consumptionPropensityFromIncome",
      DEFAULT_LABOUR_PHASE1_POLICY.consumptionPropensityFromIncome
    ),
    baselineExpectedSalesGrowth: num(
      "baselineExpectedSalesGrowth",
      DEFAULT_LABOUR_PHASE1_POLICY.baselineExpectedSalesGrowth
    ),
    salesExpectationAdaptation: num(
      "salesExpectationAdaptation",
      DEFAULT_LABOUR_PHASE1_POLICY.salesExpectationAdaptation
    ),
    wagePressureThreshold: num(
      "wagePressureThreshold",
      DEFAULT_LABOUR_PHASE1_POLICY.wagePressureThreshold
    ),
    wagePressureSensitivity: num(
      "wagePressureSensitivity",
      DEFAULT_LABOUR_PHASE1_POLICY.wagePressureSensitivity
    ),
  };
}

export function hydrateAutomatedSimulationState(raw: unknown): AutomatedSimulationState {
  if (!raw || typeof raw !== "object") {
    throw new Error("Automated simulation state must be a non-null object");
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.financial !== "object" || o.financial === null) {
    throw new Error("Automated state must include financial");
  }
  const financial = hydrateFinancialSimulationState(o.financial);

  let realHistory: RealEconomyState[];
  if (Array.isArray(o.realHistory)) {
    realHistory = o.realHistory.map(normalizeRealEconomyState);
  } else if (o.real && typeof o.real === "object") {
    realHistory = [normalizeRealEconomyState(o.real)];
  } else {
    realHistory = [{ ...DEFAULT_REAL_ECONOMY_STATE }];
  }

  let metricsHistory: RealEconomyMetrics[];
  if (Array.isArray(o.metricsHistory)) {
    metricsHistory = o.metricsHistory.map(normalizeRealEconomyMetrics);
  } else if (Array.isArray(o.realHistory)) {
    metricsHistory = o.realHistory.map(normalizeRealEconomyMetrics);
  } else if (o.real && typeof o.real === "object") {
    metricsHistory = [normalizeRealEconomyMetrics(o.real)];
  } else {
    metricsHistory = [{ ...DEFAULT_REAL_ECONOMY_METRICS }];
  }

  if (
    realHistory.length !== financial.history.length ||
    metricsHistory.length !== financial.history.length
  ) {
    throw new Error(
      `Automated state histories must match financial.history length ${financial.history.length}`
    );
  }

  return {
    financial,
    realHistory,
    metricsHistory,
    policy: normalizePolicy(o.policy),
  };
}

export function loadAutomatedSimulationFromBrowser(
  slotId: string
): AutomatedSimulationState | null {
  if (typeof window === "undefined") return null;
  let json: string | null;
  try {
    json = window.localStorage.getItem(automatedSaveStorageKey(slotId));
  } catch {
    return null;
  }
  if (json === null || json === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const env = parsed as Record<string, unknown>;
  if (env.formatVersion !== AUTOMATED_SAVE_FORMAT_VERSION) return null;
  if (typeof env.state !== "object" || env.state === null) return null;
  try {
    return hydrateAutomatedSimulationState(env.state);
  } catch {
    return null;
  }
}

export function persistAutomatedSimulationToBrowser(
  slotId: string,
  state: AutomatedSimulationState
): void {
  if (typeof window === "undefined") return;
  const envelope: AutomatedSaveEnvelopeV1 = {
    formatVersion: AUTOMATED_SAVE_FORMAT_VERSION,
    slotId,
    savedAt: new Date().toISOString(),
    state,
  };
  try {
    window.localStorage.setItem(automatedSaveStorageKey(slotId), JSON.stringify(envelope));
  } catch {
    // ignore
  }
}

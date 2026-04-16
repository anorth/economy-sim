/**
 * Browser persistence for the automated labour-only simulation (financial + real + policy).
 */

import type { AutomatedSimulationState } from "./automated/state";
import { hydrateFinancialSimulationState } from "./saveGame";
import type { LabourPhase1Policy } from "./automated/policy";
import { DEFAULT_LABOUR_PHASE1_POLICY } from "./automated/policy";
import type { RealEconomyState } from "./automated/real";
import { DEFAULT_REAL_ECONOMY_STATE } from "./automated/real";

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
    labourProductivity: num("labourProductivity", DEFAULT_REAL_ECONOMY_STATE.labourProductivity),
    expectedSales: num("expectedSales", DEFAULT_REAL_ECONOMY_STATE.expectedSales),
    lastPeriodOutput: num("lastPeriodOutput", DEFAULT_REAL_ECONOMY_STATE.lastPeriodOutput),
    lastPeriodConsumption: num(
      "lastPeriodConsumption",
      DEFAULT_REAL_ECONOMY_STATE.lastPeriodConsumption
    ),
    lastPeriodWageBill: num("lastPeriodWageBill", DEFAULT_REAL_ECONOMY_STATE.lastPeriodWageBill),
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
    householdIncomeTaxRate: num(
      "householdIncomeTaxRate",
      DEFAULT_LABOUR_PHASE1_POLICY.householdIncomeTaxRate
    ),
    consumptionPropensityFromDeposits: num(
      "consumptionPropensityFromDeposits",
      DEFAULT_LABOUR_PHASE1_POLICY.consumptionPropensityFromDeposits
    ),
    salesExpectationAdaptation: num(
      "salesExpectationAdaptation",
      DEFAULT_LABOUR_PHASE1_POLICY.salesExpectationAdaptation
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

  if (realHistory.length !== financial.history.length) {
    throw new Error(
      `Automated state: realHistory length ${realHistory.length} must match financial.history length ${financial.history.length}`
    );
  }

  return {
    financial,
    realHistory,
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

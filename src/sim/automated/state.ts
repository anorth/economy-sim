import type { FinancialSimulationState } from "../simulation";
import { createFinancialSimulation } from "../simulation";
import type { LabourPhase1Policy } from "./policy";
import { DEFAULT_LABOUR_PHASE1_POLICY } from "./policy";
import type { RealEconomyMetrics, RealEconomyState } from "./real";
import { DEFAULT_REAL_ECONOMY_METRICS, DEFAULT_REAL_ECONOMY_STATE } from "./real";

/**
 * Automated labour-only run: financial ledger + real-side history + policy.
 *
 * `realHistory[k]` and `metricsHistory[k]` align with `financial.history[k]`
 * (k = 0 initial, k = N after N advances).
 */
export type AutomatedSimulationState = {
  financial: FinancialSimulationState;
  realHistory: RealEconomyState[];
  metricsHistory: RealEconomyMetrics[];
  policy: LabourPhase1Policy;
};

export function currentReal(state: AutomatedSimulationState): RealEconomyState {
  return state.realHistory[state.realHistory.length - 1]!;
}

export function currentMetrics(state: AutomatedSimulationState): RealEconomyMetrics {
  return state.metricsHistory[state.metricsHistory.length - 1]!;
}

export function createAutomatedSimulation(
  policyOverrides?: Partial<LabourPhase1Policy>,
  initialRealOverrides?: Partial<RealEconomyState>
): AutomatedSimulationState {
  return {
    financial: createFinancialSimulation(),
    realHistory: [{ ...DEFAULT_REAL_ECONOMY_STATE, ...initialRealOverrides }],
    metricsHistory: [{ ...DEFAULT_REAL_ECONOMY_METRICS }],
    policy: { ...DEFAULT_LABOUR_PHASE1_POLICY, ...policyOverrides },
  };
}

import type { FinancialSimulationState } from "../simulation";
import { createFinancialSimulation } from "../simulation";
import type { LabourPhase1Policy } from "./policy";
import { DEFAULT_LABOUR_PHASE1_POLICY } from "./policy";
import type { RealEconomyState } from "./real";
import { DEFAULT_REAL_ECONOMY_STATE } from "./real";

/**
 * Automated labour-only run: financial ledger + real-side history + policy.
 *
 * `realHistory[k]` aligns with `financial.history[k]` (k = 0 initial, k = N after N advances).
 */
export type AutomatedSimulationState = {
  financial: FinancialSimulationState;
  realHistory: RealEconomyState[];
  policy: LabourPhase1Policy;
};

export function currentReal(state: AutomatedSimulationState): RealEconomyState {
  return state.realHistory[state.realHistory.length - 1]!;
}

export function createAutomatedSimulation(
  policyOverrides?: Partial<LabourPhase1Policy>
): AutomatedSimulationState {
  return {
    financial: createFinancialSimulation(),
    realHistory: [{ ...DEFAULT_REAL_ECONOMY_STATE }],
    policy: { ...DEFAULT_LABOUR_PHASE1_POLICY, ...policyOverrides },
  };
}

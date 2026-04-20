import { applyAndAdvance, undoLastPeriod } from "../simulation";
import type { AutomatedSimulationState } from "./state";
import { currentMetrics, currentReal } from "./state";
import { planLabourPhase1Period } from "./stepPeriod";

export type AutomatedStepResult = {
  state: AutomatedSimulationState;
};

/**
 * Advance one period: plan actions from policy + real state, apply as one batch to the financial sim.
 */
export function applyAutomatedPeriod(state: AutomatedSimulationState): AutomatedStepResult {
  const real = currentReal(state);
  const prevMetrics = currentMetrics(state);
  const { actions, nextReal, metrics } = planLabourPhase1Period(
    state.financial,
    real,
    prevMetrics,
    state.policy
  );
  const { state: nextFinancial } = applyAndAdvance(state.financial, actions);
  return {
    state: {
      financial: nextFinancial,
      realHistory: [...state.realHistory, nextReal],
      metricsHistory: [...state.metricsHistory, metrics],
      policy: state.policy,
    },
  };
}

/**
 * Undo the last automated period: restores financial ledger and real-side tip.
 */
export function undoAutomatedLastPeriod(
  state: AutomatedSimulationState
): AutomatedSimulationState {
  if (state.financial.periods.length === 0) {
    return state;
  }
  return {
    financial: undoLastPeriod(state.financial),
    realHistory: state.realHistory.slice(0, -1),
    metricsHistory: state.metricsHistory.slice(0, -1),
    policy: state.policy,
  };
}

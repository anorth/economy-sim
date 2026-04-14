import { Ledger } from "./ledger";
import { applyAction, type SimAction } from "./events";
import { buildSnapshot, type EconomySnapshot } from "./snapshot";

/** One executed action in chronological order (global sequence number). */
export type ActionLogEntry = {
  seq: number;
  /** Period index after the step that applied this action (same for all actions in one batch). */
  periodAfter: number;
  action: SimAction;
};

export type SimulationState = {
  period: number;
  ledger: Ledger;
  /** One entry per completed period (after step), plus initial at index 0 */
  history: EconomySnapshot[];
  /** Append-only log of every action applied (in order). */
  actionLog: ActionLogEntry[];
};

export function createSimulation(initial?: ConstructorParameters<typeof Ledger>[0]): SimulationState {
  const ledger = new Ledger(initial);
  const s0 = buildSnapshot(ledger, 0);
  return { period: 0, ledger, history: [s0], actionLog: [] };
}

export type StepResult = {
  state: SimulationState;
  snapshot: EconomySnapshot;
};

/**
 * Apply any number of actions in one period, then advance the clock.
 * All actions occur within the same accounting period before snapshotting.
 */
export function applyAndAdvance(
  state: SimulationState,
  actions: SimAction[],
  opts?: { clone?: boolean }
): StepResult {
  const ledger = opts?.clone === false ? state.ledger : state.ledger.clone();
  for (const a of actions) applyAction(ledger, a);
  const period = state.period + 1;
  const snapshot = buildSnapshot(ledger, period);
  const baseSeq = state.actionLog.length;
  const newEntries: ActionLogEntry[] = actions.map((action, i) => ({
    seq: baseSeq + i,
    periodAfter: period,
    action,
  }));
  const next: SimulationState = {
    period,
    ledger,
    history: [...state.history, snapshot],
    actionLog: [...state.actionLog, ...newEntries],
  };
  return { state: next, snapshot };
}

/** Apply actions without advancing period (rare; useful for batching in UI). */
export function applyInPlace(state: SimulationState, actions: SimAction[]): void {
  for (const a of actions) applyAction(state.ledger, a);
}

export function advanceOnly(state: SimulationState): StepResult {
  return applyAndAdvance(state, [], { clone: false });
}

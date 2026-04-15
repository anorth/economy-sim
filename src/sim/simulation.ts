import {
  clonePostings,
  emptyPostings,
  type AccountPostings,
  type AccountPostingsSeed,
  type JournalLine,
  validateJournalLines,
} from "./postings";
import { applyAction, linesForAction, type SimAction } from "./events";
import { buildEconomyView, type EconomyView } from "./snapshot";

export type { AccountPostingsSeed };

/** One UI “run period”: queued actions (possibly zero) and the full journal for that period. */
export type PeriodRecord = {
  actions: SimAction[];
  /** All lines posted this period, in order (concatenation of `linesForAction` per action). */
  journalLines: JournalLine[];
};

/** One executed action in chronological order (for UI lists). */
export type ActionLogEntry = {
  seq: number;
  /** Period index after the step that contained this action (1-based). */
  periodAfter: number;
  action: SimAction;
};

/**
 * Persisted simulation timeline (plus optional initial seed).
 *
 * Derivation order:
 * - `initialPostingsSeed` — starting chart-of-accounts totals (optional).
 * - `periods` — append-only journal of what happened (actions + frozen journal lines).
 * - `history` — cached fold of posting totals after each timestep: `history[0]` is the initial book,
 *   `history[k]` is the book after `k` completed period advances. Same information as replaying
 *   `periods` from `emptyPostings(initialPostingsSeed)`, kept so undo does not replay.
 *
 * `history` is intentionally redundant with `periods`: it is a cache for constant-time undo and
 * instant point-in-time reads.
 *
 * Completed period count = `periods.length`. Current book = `history[periods.length]`.
 */
export type SimulationState = {
  initialPostingsSeed: AccountPostingsSeed | undefined;
  /** Append-only source of truth for what happened each period. */
  periods: PeriodRecord[];
  /** Cached fold of postings at each period boundary (`history.length = periods.length + 1`). */
  history: AccountPostings[];
};

/** Book after the last completed advance (`history[history.length - 1]`). */
export function currentPostings(state: SimulationState): AccountPostings {
  return state.history[state.history.length - 1]!;
}

export function completedPeriodCount(state: SimulationState): number {
  return state.periods.length;
}

/**
 * Validate persisted simulation invariants:
 * - history has exactly one more frame than periods (initial + one per period)
 * - each stored period journal is balanced under double-entry rules
 *
 * This is intended for hydrate/load boundaries and sanity checks in tests.
 */
export function validateSimulationState(state: SimulationState): void {
  const expectedHistoryLength = state.periods.length + 1;
  if (state.history.length !== expectedHistoryLength) {
    throw new Error(
      `Invalid simulation state: history length ${state.history.length} does not match periods + 1 (${expectedHistoryLength})`
    );
  }
  for (let i = 0; i < state.periods.length; i++) {
    const period = state.periods[i]!;
    try {
      validateJournalLines(period.journalLines);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid period ${i + 1} journal: ${msg}`);
    }
  }
}

/** Linear action list for UI (seq + period index). */
export function flattenActionLog(periodBatches: SimAction[][]): ActionLogEntry[] {
  const out: ActionLogEntry[] = [];
  let seq = 0;
  for (let pi = 0; pi < periodBatches.length; pi++) {
    for (const action of periodBatches[pi]!) {
      out.push({ seq: seq++, periodAfter: pi + 1, action });
    }
  }
  return out;
}

export function createSimulation(initial?: AccountPostingsSeed): SimulationState {
  const h0 = emptyPostings(initial);
  return {
    initialPostingsSeed: initial,
    periods: [],
    history: [h0],
  };
}

export type StepResult = {
  state: SimulationState;
};

function journalForActions(actions: SimAction[]): JournalLine[] {
  return actions.flatMap((a) => linesForAction(a));
}

/**
 * Apply any number of actions in one period, then advance the clock.
 * All actions occur within the same accounting period before snapshotting.
 */
export function applyAndAdvance(state: SimulationState, actions: SimAction[]): StepResult {
  const nextPostings = clonePostings(currentPostings(state));
  for (const a of actions) applyAction(nextPostings, a);
  const record: PeriodRecord = {
    actions: [...actions],
    journalLines: journalForActions(actions),
  };
  const next: SimulationState = {
    initialPostingsSeed: state.initialPostingsSeed,
    periods: [...state.periods, record],
    history: [...state.history, nextPostings],
  };
  return { state: next };
}

export function advanceOnly(state: SimulationState): StepResult {
  return applyAndAdvance(state, []);
}

/**
 * Undo the last **period** (entire batch, including empty advances): drop last journal block and
 * last posting snapshot; the previous `history` tip becomes current.
 */
export function undoLastPeriod(state: SimulationState): SimulationState {
  if (state.periods.length === 0) {
    return state;
  }
  return {
    initialPostingsSeed: state.initialPostingsSeed,
    periods: state.periods.slice(0, -1),
    history: state.history.slice(0, -1),
  };
}

function assertValidPeriodIndex(state: SimulationState, periodIndex: number): void {
  if (!Number.isInteger(periodIndex)) {
    throw new Error(`periodIndex must be an integer, got ${periodIndex}`);
  }
  const max = state.periods.length;
  if (periodIndex < 0 || periodIndex > max) {
    throw new Error(`periodIndex ${periodIndex} out of bounds; expected 0..${max}`);
  }
}

/**
 * Point-in-time postings without mutating period stacks (for scrubber UI).
 * `periodIndex` 0 = initial book; must be ≤ `periods.length`.
 */
export function postingsAtPeriod(state: SimulationState, periodIndex: number): AccountPostings {
  assertValidPeriodIndex(state, periodIndex);
  return state.history[periodIndex]!;
}

/**
 * Derived economy view at a past period boundary.
 * `periodIndex` 0 = initial; must be ≤ `periods.length`.
 */
export function economyViewAtPeriod(state: SimulationState, periodIndex: number): EconomyView {
  return buildEconomyView(postingsAtPeriod(state, periodIndex), periodIndex);
}

/**
 * Browser “save game” persistence.
 *
 * Intent: the simulation’s persisted truth is {@link SimulationState} (seed, period log, posting
 * history). We wrap it in a versioned envelope so migrations and multi-slot keys stay
 * straightforward later.
 *
 * API surface: `saveSlotStorageKey` / `DEFAULT_SAVE_SLOT_ID` reserve room for multiple slots without
 * changing storage layout today (single slot writes to the default id).
 */

import { ACCOUNT_META, type AccountId } from "./accounts";
import type { SimAction } from "./events";
import type { JournalLine } from "./postings";
import { normalizePostings, normalizePostingsSeed } from "./postings";
import type { PeriodRecord, SimulationState } from "./simulation";
import { validateSimulationState } from "./simulation";

export const SAVE_FORMAT_VERSION = 1 as const;

/** Single slot for now; additional ids can be supported without changing the envelope shape. */
export const DEFAULT_SAVE_SLOT_ID = "default" as const;

const STORAGE_KEY_PREFIX = "economy-sim:v1:slot:";

export function saveSlotStorageKey(slotId: string): string {
  return `${STORAGE_KEY_PREFIX}${slotId}`;
}

export type SaveEnvelopeV1 = {
  formatVersion: typeof SAVE_FORMAT_VERSION;
  slotId: string;
  savedAt: string;
  simulation: SimulationState;
};

function isAccountId(s: unknown): s is AccountId {
  return typeof s === "string" && s in ACCOUNT_META;
}

function normalizeJournalLine(raw: unknown): JournalLine {
  if (!raw || typeof raw !== "object") {
    throw new Error("Journal line must be an object");
  }
  const o = raw as Record<string, unknown>;
  if (!isAccountId(o.accountId)) {
    throw new Error("Invalid journal line accountId");
  }
  const debit = typeof o.debit === "number" && Number.isFinite(o.debit) ? o.debit : 0;
  const credit = typeof o.credit === "number" && Number.isFinite(o.credit) ? o.credit : 0;
  return { accountId: o.accountId, debit, credit };
}

function normalizePeriodRecord(raw: unknown): PeriodRecord {
  if (!raw || typeof raw !== "object") {
    throw new Error("Period record must be an object");
  }
  const p = raw as Record<string, unknown>;
  if (!Array.isArray(p.actions) || !Array.isArray(p.journalLines)) {
    throw new Error("Period record must have actions and journalLines arrays");
  }
  return {
    actions: p.actions as SimAction[],
    journalLines: p.journalLines.map(normalizeJournalLine),
  };
}

/**
 * Rebuild runtime {@link SimulationState} from JSON (e.g. `localStorage`).
 * Throws if the payload cannot be interpreted safely.
 */
export function hydrateSimulationState(raw: unknown): SimulationState {
  if (!raw || typeof raw !== "object") {
    throw new Error("Simulation state must be a non-null object");
  }
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.history) || !Array.isArray(o.periods)) {
    throw new Error("Simulation state must include history and periods arrays");
  }
  const history = o.history.map((h) => normalizePostings(h));
  const periods = o.periods.map(normalizePeriodRecord);
  const initialPostingsSeed = normalizePostingsSeed(o.initialPostingsSeed);
  const state: SimulationState = {
    initialPostingsSeed,
    periods,
    history,
  };
  validateSimulationState(state);
  return state;
}

function parseEnvelope(raw: string): unknown {
  return JSON.parse(raw) as unknown;
}

/**
 * Load a saved simulation for `slotId`, or `null` if missing / invalid / unreadable.
 * On the server, always returns `null` (no `localStorage`).
 */
export function loadSimulationFromBrowser(slotId: string): SimulationState | null {
  if (typeof window === "undefined") return null;
  let json: string | null;
  try {
    json = window.localStorage.getItem(saveSlotStorageKey(slotId));
  } catch {
    return null;
  }
  if (json === null || json === "") return null;
  let parsed: unknown;
  try {
    parsed = parseEnvelope(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const env = parsed as Record<string, unknown>;
  if (env.formatVersion !== SAVE_FORMAT_VERSION) return null;
  if (typeof env.simulation !== "object" || env.simulation === null) return null;
  try {
    return hydrateSimulationState(env.simulation);
  } catch {
    return null;
  }
}

/**
 * Persist `state` for `slotId`. Swallows quota / private-mode errors so the UI never crashes.
 */
export function persistSimulationToBrowser(slotId: string, state: SimulationState): void {
  if (typeof window === "undefined") return;
  const envelope: SaveEnvelopeV1 = {
    formatVersion: SAVE_FORMAT_VERSION,
    slotId,
    savedAt: new Date().toISOString(),
    simulation: state,
  };
  try {
    window.localStorage.setItem(saveSlotStorageKey(slotId), JSON.stringify(envelope));
  } catch {
    // ignore quota / security errors
  }
}

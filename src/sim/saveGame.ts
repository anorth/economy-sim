/**
 * Browser “save game” persistence for the **manual** financial ledger simulation.
 *
 * Intent: the persisted truth is {@link FinancialSimulationState} (seed, period log, posting
 * history). We wrap it in a versioned envelope so migrations and multi-slot keys stay
 * straightforward later.
 */

import { ACCOUNT_META, type AccountId } from "./accounts";
import type { SimAction } from "./events";
import type { JournalLine } from "./postings";
import { normalizePostings, normalizePostingsSeed } from "./postings";
import type { FinancialSimulationState, PeriodRecord } from "./simulation";
import { validateFinancialSimulationState } from "./simulation";

export const SAVE_FORMAT_VERSION = 1 as const;

/** Storage slot for the manual financial simulation (distinct from automated). */
export const MANUAL_FINANCIAL_SLOT_ID = "manual-financial" as const;

/** @deprecated Prefer {@link MANUAL_FINANCIAL_SLOT_ID}. Legacy default slot id for migration. */
export const LEGACY_DEFAULT_SLOT_ID = "default" as const;

const STORAGE_KEY_PREFIX = "economy-sim:v1:slot:";

export function saveSlotStorageKey(slotId: string): string {
  return `${STORAGE_KEY_PREFIX}${slotId}`;
}

export type SaveEnvelopeV1 = {
  formatVersion: typeof SAVE_FORMAT_VERSION;
  slotId: string;
  savedAt: string;
  simulation: FinancialSimulationState;
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
 * Rebuild runtime {@link FinancialSimulationState} from JSON (e.g. `localStorage`).
 * Throws if the payload cannot be interpreted safely.
 */
export function hydrateFinancialSimulationState(raw: unknown): FinancialSimulationState {
  if (!raw || typeof raw !== "object") {
    throw new Error("Financial simulation state must be a non-null object");
  }
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.history) || !Array.isArray(o.periods)) {
    throw new Error("Financial simulation state must include history and periods arrays");
  }
  const history = o.history.map((h) => normalizePostings(h));
  const periods = o.periods.map(normalizePeriodRecord);
  const initialPostingsSeed = normalizePostingsSeed(o.initialPostingsSeed);
  const state: FinancialSimulationState = {
    initialPostingsSeed,
    periods,
    history,
  };
  validateFinancialSimulationState(state);
  return state;
}

function parseEnvelope(raw: string): unknown {
  return JSON.parse(raw) as unknown;
}

/**
 * Load a saved manual financial simulation for `slotId`, or `null` if missing / invalid / unreadable.
 * On the server, always returns `null` (no `localStorage`).
 */
export function loadSimulationFromBrowser(slotId: string): FinancialSimulationState | null {
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
    return hydrateFinancialSimulationState(env.simulation);
  } catch {
    return null;
  }
}

/**
 * Load manual sim, trying the current slot first then the legacy `"default"` slot once.
 */
export function loadManualFinancialSimulationFromBrowser(): FinancialSimulationState | null {
  return (
    loadSimulationFromBrowser(MANUAL_FINANCIAL_SLOT_ID) ??
    loadSimulationFromBrowser(LEGACY_DEFAULT_SLOT_ID)
  );
}

/**
 * Persist `state` for `slotId`. Swallows quota / private-mode errors so the UI never crashes.
 */
export function persistSimulationToBrowser(
  slotId: string,
  state: FinancialSimulationState
): void {
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

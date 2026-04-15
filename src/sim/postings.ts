import {
  ACCOUNT_META,
  type AccountId,
  type AccountKind,
  signedBalance,
} from "./accounts";

export type JournalLine = { accountId: AccountId; debit: number; credit: number };

/** Serializable cumulative debit/credit per account (the “book” at a point in time). */
export type AccountPostings = Record<AccountId, { debit: number; credit: number }>;

/** Partial chart-of-accounts seed; merged into zeros for all accounts. */
export type AccountPostingsSeed = Partial<Record<AccountId, { debit: number; credit: number }>>;

/**
 * Model intent:
 * - `AccountPostings` is the persisted accounting state at a period boundary.
 * - Mutations are only additive postings (via journal lines), never direct balance writes.
 * - Everything user-facing (sector rows, aggregates, charts) is derived from this structure.
 */

function assertNonNegative(name: string, v: number) {
  if (v < 0 || Number.isNaN(v)) throw new Error(`${name} must be non-negative, got ${v}`);
}

const JOURNAL_EPSILON = 1e-9;

export function emptyPostings(seed?: AccountPostingsSeed): AccountPostings {
  const out = {} as AccountPostings;
  for (const id of Object.keys(ACCOUNT_META) as AccountId[]) {
    const s = seed?.[id];
    out[id] = { debit: s?.debit ?? 0, credit: s?.credit ?? 0 };
  }
  return out;
}

export function clonePostings(p: AccountPostings): AccountPostings {
  const out = {} as AccountPostings;
  for (const id of Object.keys(ACCOUNT_META) as AccountId[]) {
    const row = p[id];
    out[id] = { debit: row?.debit ?? 0, credit: row?.credit ?? 0 };
  }
  return out;
}

/** Normalize JSON loaded from storage (sparse or partial keys). */
export function normalizePostings(raw: unknown): AccountPostings {
  const base = emptyPostings();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  for (const id of Object.keys(ACCOUNT_META) as AccountId[]) {
    const row = o[id];
    if (row && typeof row === "object" && row !== null) {
      const r = row as Record<string, unknown>;
      const d = r.debit;
      const c = r.credit;
      base[id] = {
        debit: typeof d === "number" && Number.isFinite(d) ? d : 0,
        credit: typeof c === "number" && Number.isFinite(c) ? c : 0,
      };
    }
  }
  return base;
}

export function balance(postings: AccountPostings, id: AccountId): number {
  const m = ACCOUNT_META[id];
  const { debit, credit } = postings[id]!;
  return signedBalance(m.kind, debit, credit);
}

export function sumBalances(postings: AccountPostings, ids: AccountId[]): number {
  return ids.reduce((s, id) => s + balance(postings, id), 0);
}

/**
 * Validate one journal batch using double-entry rules:
 * - no negative numbers
 * - no single line with both debit and credit
 * - total debits equal total credits
 */
export function validateJournalLines(lines: JournalLine[]): void {
  let dr = 0;
  let cr = 0;
  for (const ln of lines) {
    assertNonNegative(`debit@${ln.accountId}`, ln.debit);
    assertNonNegative(`credit@${ln.accountId}`, ln.credit);
    if (ln.debit > 0 && ln.credit > 0) {
      throw new Error(`Line ${ln.accountId} cannot have both debit and credit`);
    }
    dr += ln.debit;
    cr += ln.credit;
  }
  if (Math.abs(dr - cr) > JOURNAL_EPSILON) {
    throw new Error(`Unbalanced journal: debits ${dr} credits ${cr}`);
  }
}

export function applyJournalLines(postings: AccountPostings, lines: JournalLine[]): void {
  validateJournalLines(lines);
  for (const ln of lines) {
    const cell = postings[ln.accountId]!;
    cell.debit += ln.debit;
    cell.credit += ln.credit;
  }
}

export function line(accountId: AccountId, debit: number, credit: number): JournalLine {
  return { accountId, debit, credit };
}

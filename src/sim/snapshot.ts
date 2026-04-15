import type { AccountId, AccountKind } from "./accounts";
import { ACCOUNT_META } from "./accounts";
import {
  balance,
  type AccountPostings,
} from "./postings";

/**
 * Read-model helpers built from postings.
 *
 * Nothing in this file is part of the persisted simulation state. These shapes exist to support UI,
 * charting, and diagnostics from a single period's `AccountPostings`.
 */
export type SectorName =
  | "Households"
  | "Firms"
  | "Banks"
  | "Treasury"
  | "Central Bank";

const SECTOR_ACCOUNTS: Record<SectorName, AccountId[]> = {
  Households: ["hh.deposits", "hh.loans", "hh.bonds", "hh.equity"],
  Firms: ["firms.deposits", "firms.loans", "firms.bonds", "firms.equity"],
  Banks: [
    "banks.reserves",
    "banks.loans",
    "banks.deposits_due",
    "banks.bonds",
    "banks.equity",
  ],
  Treasury: ["treasury.cb_account", "treasury.bonds", "treasury.equity"],
  "Central Bank": ["cb.reserves_liability", "cb.treasury_account", "cb.bonds"],
};

export type SectorAccountRow = {
  id: AccountId;
  label: string;
  kind: AccountKind;
  balance: number;
};

export type SectorSnapshot = {
  sector: SectorName;
  /** Sum of asset account balances. */
  assets: number;
  /** Sum of liability account balances. */
  liabilities: number;
  /** Sum of equity account balances. */
  equity: number;
  /** Financial assets minus financial liabilities (should match `equity` when books tie). */
  netFinancialAssets: number;
  /** Ordered line items for this sector. */
  accounts: SectorAccountRow[];
};

/** Net financial position = financial assets minus financial liabilities (equity is the residual and should match). */
export function sectorSnapshots(postings: AccountPostings): SectorSnapshot[] {
  return (Object.keys(SECTOR_ACCOUNTS) as SectorName[]).map((sector) => {
    const ids = SECTOR_ACCOUNTS[sector];
    const accounts: SectorAccountRow[] = [];
    let assets = 0;
    let liabilities = 0;
    let equity = 0;
    for (const id of ids) {
      const b = balance(postings, id);
      const kind = ACCOUNT_META[id].kind;
      accounts.push({
        id,
        label: ACCOUNT_META[id].label,
        kind,
        balance: b,
      });
      if (kind === "asset") assets += b;
      else if (kind === "liability") liabilities += b;
      else equity += b;
    }
    const netFinancialAssets = assets - liabilities;
    return { sector, assets, liabilities, equity, netFinancialAssets, accounts };
  });
}

export type AccountDisplayRow = {
  debit: number;
  credit: number;
  balance: number;
  kind: AccountKind;
};

export type AccountDisplay = Record<AccountId, AccountDisplayRow>;

export function accountDisplayFromPostings(postings: AccountPostings): AccountDisplay {
  const out = {} as AccountDisplay;
  for (const id of Object.keys(ACCOUNT_META) as AccountId[]) {
    const { debit, credit } = postings[id]!;
    out[id] = {
      debit,
      credit,
      balance: balance(postings, id),
      kind: ACCOUNT_META[id].kind,
    };
  }
  return out;
}

export type EconomyAggregates = {
  /** Bank deposits to HH + Firms — broad money; no physical cash in this model. */
  moneySupply: number;
  /** Bank loans to households and firms (private-sector debt to banks). */
  privateDebt: number;
  /** Treasury bonds outstanding (government debt). */
  publicDebt: number;
  totalReserves: number;
  bankBonds: number;
  hhBonds: number;
  firmBonds: number;
  cbBonds: number;
  bankLoans: number;
  hhLoans: number;
  firmLoans: number;
  generalAccount: number;
  treasuryEquity: number;
  hhEquity: number;
  firmEquity: number;
  bankEquity: number;
};

export function economyAggregates(postings: AccountPostings): EconomyAggregates {
  return {
    moneySupply: balance(postings, "hh.deposits") + balance(postings, "firms.deposits"),
    privateDebt: balance(postings, "hh.loans") + balance(postings, "firms.loans"),
    publicDebt: balance(postings, "treasury.bonds"),
    totalReserves: balance(postings, "banks.reserves"),
    bankBonds: balance(postings, "banks.bonds"),
    hhBonds: balance(postings, "hh.bonds"),
    firmBonds: balance(postings, "firms.bonds"),
    cbBonds: balance(postings, "cb.bonds"),
    bankLoans: balance(postings, "banks.loans"),
    hhLoans: balance(postings, "hh.loans"),
    firmLoans: balance(postings, "firms.loans"),
    generalAccount: balance(postings, "treasury.cb_account"),
    treasuryEquity: balance(postings, "treasury.equity"),
    hhEquity: balance(postings, "hh.equity"),
    firmEquity: balance(postings, "firms.equity"),
    bankEquity: balance(postings, "banks.equity"),
  };
}

/**
 * Derived UI/reporting snapshot: not persisted; built from {@link AccountPostings} on demand.
 * `period` is the simulation period index (0 = initial, N = after N completed advances).
 */
export type EconomyView = {
  period: number;
  accounts: AccountDisplay;
  sectors: SectorSnapshot[];
  aggregates: EconomyAggregates;
};

export function buildEconomyView(postings: AccountPostings, period: number): EconomyView {
  return {
    period,
    accounts: accountDisplayFromPostings(postings),
    sectors: sectorSnapshots(postings),
    aggregates: economyAggregates(postings),
  };
}

/**
 * Chart of accounts — five-sector closed economy (Keen / SFC style).
 * Each account stores debit/credit totals; balances follow normal accounting signs.
 */

export type AccountKind = "asset" | "liability" | "equity";

export type AccountId =
  | "hh.deposits"
  | "hh.loans"
  | "hh.bonds"
  | "hh.equity"
  | "firms.deposits"
  | "firms.loans"
  | "firms.bonds"
  | "firms.equity"
  | "banks.reserves"
  | "banks.loans"
  | "banks.deposits_due"
  | "banks.bonds"
  | "banks.equity"
  | "treasury.cb_account"
  | "treasury.bonds"
  | "treasury.equity"
  | "cb.reserves_liability"
  | "cb.treasury_account"
  | "cb.bonds";

export const ACCOUNT_META: Record<
  AccountId,
  { label: string; kind: AccountKind; sector: string }
> = {
  "hh.deposits": { label: "Deposits", kind: "asset", sector: "Households" },
  "hh.loans": { label: "Loans", kind: "liability", sector: "Households" },
  "hh.bonds": { label: "Govt bonds held", kind: "asset", sector: "Households" },
  "hh.equity": { label: "Equity", kind: "equity", sector: "Households" },
  "firms.deposits": { label: "Deposits", kind: "asset", sector: "Firms" },
  "firms.loans": { label: "Loans", kind: "liability", sector: "Firms" },
  "firms.bonds": { label: "Govt bonds held", kind: "asset", sector: "Firms" },
  "firms.equity": { label: "Equity", kind: "equity", sector: "Firms" },
  "banks.reserves": { label: "Reserves", kind: "asset", sector: "Banks" },
  "banks.loans": { label: "Loans issued", kind: "asset", sector: "Banks" },
  "banks.deposits_due": { label: "Deposits owed", kind: "liability", sector: "Banks" },
  "banks.bonds": { label: "Govt bonds held", kind: "asset", sector: "Banks" },
  "banks.equity": { label: "Equity", kind: "equity", sector: "Banks" },
  "treasury.cb_account": { label: "General account / CRF", kind: "asset", sector: "Treasury" },
  "treasury.bonds": { label: "Bonds outstanding", kind: "liability", sector: "Treasury" },
  "treasury.equity": { label: "Equity", kind: "equity", sector: "Treasury" },
  "cb.reserves_liability": { label: "Reserves", kind: "liability", sector: "Central Bank" },
  "cb.treasury_account": { label: "Treasury General Account", kind: "liability", sector: "Central Bank" },
  "cb.bonds": { label: "Govt bonds held", kind: "asset", sector: "Central Bank" },
};

export const ALL_ACCOUNT_IDS = Object.keys(ACCOUNT_META) as AccountId[];

export function signedBalance(
  kind: AccountKind,
  debitTotal: number,
  creditTotal: number
): number {
  const net = debitTotal - creditTotal;
  if (kind === "asset") return net;
  return -net;
}

/** Signed effect on account balance from one journal line (debit/credit), normal-balance convention. */
export function balanceDeltaFromLine(
  kind: AccountKind,
  line: { debit: number; credit: number }
): number {
  if (kind === "asset") return line.debit - line.credit;
  return line.credit - line.debit;
}

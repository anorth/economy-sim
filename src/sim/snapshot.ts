import type { AccountId, AccountKind } from "./accounts";
import { ACCOUNT_META } from "./accounts";
import type { Ledger } from "./ledger";

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
  Treasury: ["treasury.general_account", "treasury.bonds", "treasury.equity"],
  "Central Bank": ["cb.reserves_liability", "cb.general_account_liability", "cb.bonds"],
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
export function sectorSnapshots(ledger: Ledger): SectorSnapshot[] {
  return (Object.keys(SECTOR_ACCOUNTS) as SectorName[]).map((sector) => {
    const ids = SECTOR_ACCOUNTS[sector];
    const accounts: SectorAccountRow[] = [];
    let assets = 0;
    let liabilities = 0;
    let equity = 0;
    for (const id of ids) {
      const b = ledger.balance(id);
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

export type EconomySnapshot = {
  period: number;
  /** Government spending minus tax in this period if tracked externally — here we expose stocks only */
  accounts: ReturnType<Ledger["toJSON"]>;
  sectors: SectorSnapshot[];
  aggregates: {
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
};

export function buildSnapshot(ledger: Ledger, period: number): EconomySnapshot {
  const j = ledger.toJSON();
  return {
    period,
    accounts: j,
    sectors: sectorSnapshots(ledger),
    aggregates: {
      moneySupply: ledger.balance("hh.deposits") + ledger.balance("firms.deposits"),
      privateDebt: ledger.balance("hh.loans") + ledger.balance("firms.loans"),
      publicDebt: ledger.balance("treasury.bonds"),
      totalReserves: ledger.balance("banks.reserves"),
      bankBonds: ledger.balance("banks.bonds"),
      hhBonds: ledger.balance("hh.bonds"),
      firmBonds: ledger.balance("firms.bonds"),
      cbBonds: ledger.balance("cb.bonds"),
      bankLoans: ledger.balance("banks.loans"),
      hhLoans: ledger.balance("hh.loans"),
      firmLoans: ledger.balance("firms.loans"),
      generalAccount: ledger.balance("treasury.general_account"),
      treasuryEquity: ledger.balance("treasury.equity"),
      hhEquity: ledger.balance("hh.equity"),
      firmEquity: ledger.balance("firms.equity"),
      bankEquity: ledger.balance("banks.equity"),
    },
  };
}

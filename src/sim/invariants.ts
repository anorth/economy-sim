import type { Ledger } from "./ledger";
import { sectorSnapshots } from "./snapshot";

/**
 * In a closed pure-financial model, the sum of each sector’s net financial assets
 * (assets minus liabilities plus equity, sector by sector) is identically zero.
 */
export function sumSectorNetFinancialAssets(ledger: Ledger): number {
  return sectorSnapshots(ledger).reduce((s, x) => s + x.netFinancialAssets, 0);
}

export function assertClosedSystem(ledger: Ledger, epsilon = 1e-6): void {
  const g = sumSectorNetFinancialAssets(ledger);
  if (Math.abs(g) > epsilon) {
    throw new Error(`Sector NFAs do not sum to zero: ${g}`);
  }
}

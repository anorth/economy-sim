import type { AccountPostings } from "./postings";
import { sectorSnapshots } from "./snapshot";

export function sumSectorNetFinancialAssets(postings: AccountPostings): number {
  return sectorSnapshots(postings).reduce((s, x) => s + x.netFinancialAssets, 0);
}

export function assertClosedSystem(postings: AccountPostings, epsilon = 1e-6): void {
  const g = sumSectorNetFinancialAssets(postings);
  if (Math.abs(g) > epsilon) {
    throw new Error(`Closed-system check failed: sum of sector NFAs = ${g}`);
  }
}

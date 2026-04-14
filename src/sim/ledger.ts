import {
  ACCOUNT_META,
  type AccountId,
  type AccountKind,
  signedBalance,
} from "./accounts";

export type JournalLine = { accountId: AccountId; debit: number; credit: number };

function assertNonNegative(name: string, v: number) {
  if (v < 0 || Number.isNaN(v)) throw new Error(`${name} must be non-negative, got ${v}`);
}

export class Ledger {
  private debits = new Map<AccountId, number>();
  private credits = new Map<AccountId, number>();

  constructor(initial?: Partial<Record<AccountId, { debit: number; credit: number }>>) {
    for (const id of Object.keys(ACCOUNT_META) as AccountId[]) {
      this.debits.set(id, 0);
      this.credits.set(id, 0);
    }
    if (initial) {
      for (const [k, v] of Object.entries(initial)) {
        if (v) this.applyLines([{ accountId: k as AccountId, debit: v.debit, credit: v.credit }]);
      }
    }
  }

  clone(): Ledger {
    const next = new Ledger();
    for (const id of this.debits.keys()) {
      next.debits.set(id, this.debits.get(id) ?? 0);
      next.credits.set(id, this.credits.get(id) ?? 0);
    }
    return next;
  }

  getTotals(id: AccountId): { debit: number; credit: number } {
    return { debit: this.debits.get(id) ?? 0, credit: this.credits.get(id) ?? 0 };
  }

  balance(id: AccountId): number {
    const m = ACCOUNT_META[id];
    const { debit, credit } = this.getTotals(id);
    return signedBalance(m.kind, debit, credit);
  }

  /** Sum of signed balances for a set of accounts (useful for sector net financial assets). */
  sumBalances(ids: AccountId[]): number {
    return ids.reduce((s, id) => s + this.balance(id), 0);
  }

  applyLines(lines: JournalLine[]): void {
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
    if (Math.abs(dr - cr) > 1e-9) {
      throw new Error(`Unbalanced journal: debits ${dr} credits ${cr}`);
    }
    for (const ln of lines) {
      this.debits.set(ln.accountId, (this.debits.get(ln.accountId) ?? 0) + ln.debit);
      this.credits.set(ln.accountId, (this.credits.get(ln.accountId) ?? 0) + ln.credit);
    }
  }

  toJSON(): Record<AccountId, { debit: number; credit: number; balance: number; kind: AccountKind }> {
    const out = {} as Record<
      AccountId,
      { debit: number; credit: number; balance: number; kind: AccountKind }
    >;
    for (const id of Object.keys(ACCOUNT_META) as AccountId[]) {
      const { debit, credit } = this.getTotals(id);
      out[id] = {
        debit,
        credit,
        balance: this.balance(id),
        kind: ACCOUNT_META[id].kind,
      };
    }
    return out;
  }
}

export function line(accountId: AccountId, debit: number, credit: number): JournalLine {
  return { accountId, debit, credit };
}

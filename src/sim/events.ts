import { Ledger, line, type JournalLine } from "./ledger";

export type FiatTarget = "households" | "firms";

export type SimAction =
  | { type: "bankLoanHouseholds"; amount: number }
  | { type: "bankLoanFirms"; amount: number }
  | { type: "repayLoanHouseholds"; amount: number }
  | { type: "repayLoanFirms"; amount: number }
  | { type: "fiatSpend"; amount: number; to: FiatTarget }
  | { type: "tax"; amount: number; from: FiatTarget }
  | { type: "treasurySellBondsToBanks"; amount: number }
  | { type: "cbBuyBondsFromBanks"; amount: number }
  | { type: "treasuryPayCouponToBanks"; amount: number }
  | { type: "banksSellBondsToHouseholds"; amount: number }
  | { type: "banksSellBondsToFirms"; amount: number };

function assertPositive(name: string, amount: number) {
  if (!(amount > 0) || Number.isNaN(amount)) throw new Error(`${name} must be positive`);
}

/** Build journal lines without applying — for testing composition. */
export function linesForAction(action: SimAction): JournalLine[] {
  switch (action.type) {
    case "bankLoanHouseholds": {
      assertPositive("amount", action.amount);
      return [
        line("banks.loans", action.amount, 0),
        line("banks.deposits_due", 0, action.amount),
        line("hh.deposits", action.amount, 0),
        line("hh.loans", 0, action.amount),
      ];
    }
    case "bankLoanFirms": {
      assertPositive("amount", action.amount);
      return [
        line("banks.loans", action.amount, 0),
        line("banks.deposits_due", 0, action.amount),
        line("firms.deposits", action.amount, 0),
        line("firms.loans", 0, action.amount),
      ];
    }
    case "repayLoanHouseholds": {
      assertPositive("amount", action.amount);
      return [
        line("hh.loans", action.amount, 0),
        line("hh.deposits", 0, action.amount),
        line("banks.deposits_due", action.amount, 0),
        line("banks.loans", 0, action.amount),
      ];
    }
    case "repayLoanFirms": {
      assertPositive("amount", action.amount);
      return [
        line("firms.loans", action.amount, 0),
        line("firms.deposits", 0, action.amount),
        line("banks.deposits_due", action.amount, 0),
        line("banks.loans", 0, action.amount),
      ];
    }
    case "fiatSpend": {
      assertPositive("amount", action.amount);
      const dep = action.to === "households" ? "hh.deposits" : "firms.deposits";
      const eq = action.to === "households" ? "hh.equity" : "firms.equity";
      return [
        line("treasury.equity", action.amount, 0),
        line("treasury.general_account", 0, action.amount),
        line("cb.general_account_liability", action.amount, 0),
        line("cb.reserves_liability", 0, action.amount),
        line("banks.reserves", action.amount, 0),
        line("banks.deposits_due", 0, action.amount),
        line(dep, action.amount, 0),
        line(eq, 0, action.amount),
      ];
    }
    case "tax": {
      assertPositive("amount", action.amount);
      const dep = action.from === "households" ? "hh.deposits" : "firms.deposits";
      const eq = action.from === "households" ? "hh.equity" : "firms.equity";
      return [
        line(eq, action.amount, 0),
        line(dep, 0, action.amount),
        line("banks.deposits_due", action.amount, 0),
        line("banks.reserves", 0, action.amount),
        line("cb.reserves_liability", action.amount, 0),
        line("cb.general_account_liability", 0, action.amount),
        line("treasury.general_account", action.amount, 0),
        line("treasury.equity", 0, action.amount),
      ];
    }
    case "treasurySellBondsToBanks": {
      assertPositive("amount", action.amount);
      return [
        line("treasury.general_account", action.amount, 0),
        line("treasury.bonds", 0, action.amount),
        line("cb.reserves_liability", action.amount, 0),
        line("cb.general_account_liability", 0, action.amount),
        line("banks.bonds", action.amount, 0),
        line("banks.reserves", 0, action.amount),
      ];
    }
    case "cbBuyBondsFromBanks": {
      assertPositive("amount", action.amount);
      return [
        line("banks.reserves", action.amount, 0),
        line("banks.bonds", 0, action.amount),
        line("cb.bonds", action.amount, 0),
        line("cb.reserves_liability", 0, action.amount),
      ];
    }
    case "treasuryPayCouponToBanks": {
      assertPositive("amount", action.amount);
      return [
        line("treasury.equity", action.amount, 0),
        line("treasury.general_account", 0, action.amount),
        line("cb.general_account_liability", action.amount, 0),
        line("cb.reserves_liability", 0, action.amount),
        line("banks.reserves", action.amount, 0),
        line("banks.equity", 0, action.amount),
      ];
    }
    case "banksSellBondsToHouseholds": {
      assertPositive("amount", action.amount);
      return [
        line("hh.bonds", action.amount, 0),
        line("hh.deposits", 0, action.amount),
        line("banks.deposits_due", action.amount, 0),
        line("banks.bonds", 0, action.amount),
      ];
    }
    case "banksSellBondsToFirms": {
      assertPositive("amount", action.amount);
      return [
        line("firms.bonds", action.amount, 0),
        line("firms.deposits", 0, action.amount),
        line("banks.deposits_due", action.amount, 0),
        line("banks.bonds", 0, action.amount),
      ];
    }
  }
}

export function applyAction(ledger: Ledger, action: SimAction): void {
  ledger.applyLines(linesForAction(action));
}

/** Short human-readable label for logs and UI. */
export function describeAction(action: SimAction): string {
  switch (action.type) {
    case "bankLoanHouseholds":
      return `Bank loan → households (${action.amount})`;
    case "bankLoanFirms":
      return `Bank loan → firms (${action.amount})`;
    case "repayLoanHouseholds":
      return `Repay loan (households) (${action.amount})`;
    case "repayLoanFirms":
      return `Repay loan (firms) (${action.amount})`;
    case "fiatSpend":
      return `Fiat spend → ${action.to} (${action.amount})`;
    case "tax":
      return `Tax ← ${action.from} (${action.amount})`;
    case "treasurySellBondsToBanks":
      return `Treasury sells bonds to banks (${action.amount})`;
    case "cbBuyBondsFromBanks":
      return `CB buys bonds from banks / OMO (${action.amount})`;
    case "treasuryPayCouponToBanks":
      return `Treasury coupon → banks (${action.amount})`;
    case "banksSellBondsToHouseholds":
      return `Banks sell bonds → households (${action.amount})`;
    case "banksSellBondsToFirms":
      return `Banks sell bonds → firms (${action.amount})`;
  }
}

export type ActionType = SimAction["type"];

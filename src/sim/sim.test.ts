import { describe, expect, it } from "vitest";
import { balanceDeltaFromLine } from "./accounts";
import { applyAndAdvance, createSimulation } from "./simulation";
import { assertClosedSystem } from "./invariants";
import { Ledger } from "./ledger";
import { linesForAction } from "./events";

describe("balanceDeltaFromLine", () => {
  it("uses normal-balance signs for each kind", () => {
    expect(balanceDeltaFromLine("asset", { debit: 100, credit: 0 })).toBe(100);
    expect(balanceDeltaFromLine("asset", { debit: 0, credit: 100 })).toBe(-100);
    expect(balanceDeltaFromLine("liability", { debit: 0, credit: 100 })).toBe(100);
    expect(balanceDeltaFromLine("liability", { debit: 100, credit: 0 })).toBe(-100);
    expect(balanceDeltaFromLine("equity", { debit: 0, credit: 100 })).toBe(100);
    expect(balanceDeltaFromLine("equity", { debit: 100, credit: 0 })).toBe(-100);
  });
});

describe("action log", () => {
  it("records one entry per action with sequential seq and periodAfter", () => {
    let s = createSimulation();
    expect(s.actionLog).toHaveLength(0);
    s = applyAndAdvance(s, [{ type: "fiatSpend", amount: 10, to: "households" }]).state;
    expect(s.actionLog).toHaveLength(1);
    expect(s.actionLog[0]!.seq).toBe(0);
    expect(s.actionLog[0]!.periodAfter).toBe(1);
    s = applyAndAdvance(s, [
      { type: "tax", amount: 3, from: "households" },
      { type: "bankLoanHouseholds", amount: 5 },
    ]).state;
    expect(s.actionLog).toHaveLength(3);
    expect(s.actionLog[1]!.seq).toBe(1);
    expect(s.actionLog[2]!.seq).toBe(2);
    expect(s.actionLog[1]!.periodAfter).toBe(2);
    expect(s.actionLog[2]!.periodAfter).toBe(2);
  });
});

describe("Ledger balance", () => {
  it("rejects unbalanced journals", () => {
    const L = new Ledger();
    expect(() => L.applyLines([{ accountId: "hh.deposits", debit: 10, credit: 0 }])).toThrow();
  });
});

describe("linesForAction", () => {
  it("produces balanced journals for every action type", () => {
    const samples = [
      { type: "bankLoanHouseholds" as const, amount: 1 },
      { type: "bankLoanFirms" as const, amount: 1 },
      { type: "repayLoanHouseholds" as const, amount: 1 },
      { type: "repayLoanFirms" as const, amount: 1 },
      { type: "fiatSpend" as const, amount: 1, to: "households" as const },
      { type: "fiatSpend" as const, amount: 1, to: "firms" as const },
      { type: "tax" as const, amount: 1, from: "households" as const },
      { type: "tax" as const, amount: 1, from: "firms" as const },
      { type: "treasurySellBondsToBanks" as const, amount: 1 },
      { type: "cbBuyBondsFromBanks" as const, amount: 1 },
      { type: "treasuryPayCouponToBanks" as const, amount: 1 },
      { type: "banksSellBondsToHouseholds" as const, amount: 1 },
      { type: "banksSellBondsToFirms" as const, amount: 1 },
    ];
    for (const a of samples) {
      const lines = linesForAction(a);
      let dr = 0;
      let cr = 0;
      for (const ln of lines) {
        dr += ln.debit;
        cr += ln.credit;
      }
      expect(dr).toBe(cr);
    }
  });
});

describe("closed system invariant", () => {
  it("holds for fiat spend to households", () => {
    const { state } = applyAndAdvance(createSimulation(), [
      { type: "fiatSpend", amount: 100, to: "households" },
    ]);
    assertClosedSystem(state.ledger);
  });

  it("holds for bank loan to households", () => {
    const { state } = applyAndAdvance(createSimulation(), [
      { type: "bankLoanHouseholds", amount: 50 },
    ]);
    assertClosedSystem(state.ledger);
  });

  it("holds for a chain: loan, fiat, tax, bonds, OMO, coupon, retail bond sale", () => {
    let s = createSimulation();
    const steps = [
      [{ type: "bankLoanHouseholds" as const, amount: 200 }],
      [{ type: "fiatSpend" as const, amount: 100, to: "households" as const }],
      [{ type: "tax" as const, amount: 30, from: "households" as const }],
      [{ type: "treasurySellBondsToBanks" as const, amount: 40 }],
      [{ type: "cbBuyBondsFromBanks" as const, amount: 20 }],
      [{ type: "treasuryPayCouponToBanks" as const, amount: 5 }],
      [{ type: "banksSellBondsToHouseholds" as const, amount: 10 }],
    ];
    for (const actions of steps) {
      s = applyAndAdvance(s, actions).state;
      assertClosedSystem(s.ledger);
    }
  });
});

describe("economic semantics", () => {
  it("fiat spend increases household deposits and equity", () => {
    const { state } = applyAndAdvance(createSimulation(), [
      { type: "fiatSpend", amount: 100, to: "households" },
    ]);
    expect(state.ledger.balance("hh.deposits")).toBe(100);
    expect(state.ledger.balance("hh.equity")).toBe(100);
    expect(state.ledger.balance("treasury.equity")).toBe(-100);
  });

  it("bank loan does not change household net financial assets", () => {
    const { state } = applyAndAdvance(createSimulation(), [
      { type: "bankLoanHouseholds", amount: 100 },
    ]);
    const hh =
      state.ledger.balance("hh.deposits") +
      state.ledger.balance("hh.bonds") -
      state.ledger.balance("hh.loans");
    expect(hh).toBe(0);
  });

  it("primary bond sale moves bonds to banks and reserves to Treasury (via CB)", () => {
    let s = createSimulation();
    s = applyAndAdvance(s, [{ type: "fiatSpend", amount: 500, to: "households" }]).state;
    const reservesBefore = s.ledger.balance("banks.reserves");
    s = applyAndAdvance(s, [{ type: "treasurySellBondsToBanks", amount: 100 }]).state;
    expect(s.ledger.balance("banks.bonds")).toBe(100);
    expect(s.ledger.balance("banks.reserves")).toBe(reservesBefore - 100);
    expect(s.ledger.balance("treasury.general_account")).toBe(-400);
    assertClosedSystem(s.ledger);
  });

  it("banks selling bonds to households destroys deposits", () => {
    let s = createSimulation();
    s = applyAndAdvance(s, [
      { type: "fiatSpend", amount: 200, to: "households" },
      { type: "treasurySellBondsToBanks", amount: 200 },
    ]).state;
    const depBefore = s.ledger.balance("hh.deposits");
    s = applyAndAdvance(s, [{ type: "banksSellBondsToHouseholds", amount: 50 }]).state;
    expect(s.ledger.balance("hh.deposits")).toBe(depBefore - 50);
    expect(s.ledger.balance("hh.bonds")).toBe(50);
  });
});

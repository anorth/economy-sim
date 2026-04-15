import { describe, expect, it } from "vitest";
import { balanceDeltaFromLine } from "./accounts";
import {
  advanceOnly,
  applyAndAdvance,
  completedPeriodCount,
  createSimulation,
  currentPostings,
  economyViewAtPeriod,
  flattenActionLog,
  postingsAtPeriod,
  undoLastPeriod,
  validateSimulationState,
} from "./simulation";
import { assertClosedSystem } from "./invariants";
import { applyJournalLines, balance, clonePostings, emptyPostings } from "./postings";
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

describe("period batches and action log", () => {
  it("records one PeriodRecord per advance with journal lines", () => {
    let s = createSimulation();
    expect(s.periods).toHaveLength(0);
    s = applyAndAdvance(s, [{ type: "fiatSpend", amount: 10, to: "households" }]).state;
    expect(s.periods).toHaveLength(1);
    expect(s.periods[0]!.actions).toHaveLength(1);
    expect(s.periods[0]!.journalLines.length).toBeGreaterThan(0);
    const log = flattenActionLog(s.periods.map((p) => p.actions));
    expect(log).toHaveLength(1);
    expect(log[0]!.seq).toBe(0);
    expect(log[0]!.periodAfter).toBe(1);
    s = applyAndAdvance(s, [
      { type: "tax", amount: 3, from: "households" },
      { type: "bankLoanHouseholds", amount: 5 },
    ]).state;
    const log2 = flattenActionLog(s.periods.map((p) => p.actions));
    expect(log2).toHaveLength(3);
    expect(log2[1]!.periodAfter).toBe(2);
    expect(log2[2]!.periodAfter).toBe(2);
  });

  it("stores empty journal for an advance-only period", () => {
    let s = createSimulation();
    s = advanceOnly(s).state;
    expect(s.periods).toHaveLength(1);
    expect(s.periods[0]!.actions).toHaveLength(0);
    expect(s.periods[0]!.journalLines).toHaveLength(0);
  });
});

describe("undo last period (snapshot stack, no replay)", () => {
  it("restores postings from previous history frame", () => {
    let s = createSimulation();
    s = applyAndAdvance(s, [{ type: "fiatSpend", amount: 100, to: "households" }]).state;
    const mid = balance(currentPostings(s), "hh.deposits");
    s = applyAndAdvance(s, [{ type: "tax", amount: 10, from: "households" }]).state;
    expect(s.periods).toHaveLength(2);
    s = undoLastPeriod(s);
    expect(s.periods).toHaveLength(1);
    expect(balance(currentPostings(s), "hh.deposits")).toBe(mid);
    expect(s.history).toHaveLength(2);
  });

  it("can undo an empty advance", () => {
    let s = createSimulation();
    s = advanceOnly(s).state;
    expect(completedPeriodCount(s)).toBe(1);
    expect(s.history).toHaveLength(2);
    s = undoLastPeriod(s);
    expect(completedPeriodCount(s)).toBe(0);
    expect(s.periods).toHaveLength(0);
    expect(s.history).toHaveLength(1);
  });

  it("is a no-op with nothing to undo", () => {
    const s = createSimulation();
    const t = undoLastPeriod(s);
    expect(t.periods).toHaveLength(0);
  });
});

describe("state validation and period bounds", () => {
  it("accepts a valid state", () => {
    let s = createSimulation();
    s = applyAndAdvance(s, [{ type: "fiatSpend", amount: 10, to: "households" }]).state;
    expect(() => validateSimulationState(s)).not.toThrow();
  });

  it("rejects inconsistent history length", () => {
    let s = createSimulation();
    s = applyAndAdvance(s, [{ type: "fiatSpend", amount: 10, to: "households" }]).state;
    const broken = { ...s, history: s.history.slice(1) };
    expect(() => validateSimulationState(broken)).toThrow(/history length/i);
  });

  it("rejects an unbalanced stored period journal", () => {
    let s = createSimulation();
    s = applyAndAdvance(s, [{ type: "fiatSpend", amount: 10, to: "households" }]).state;
    const broken = {
      ...s,
      periods: [
        ...s.periods.slice(0, -1),
        {
          ...s.periods[s.periods.length - 1]!,
          journalLines: [{ accountId: "hh.deposits" as const, debit: 1, credit: 0 }],
        },
      ],
    };
    expect(() => validateSimulationState(broken)).toThrow(/invalid period/i);
  });

  it("checks period index bounds for postings and derived view", () => {
    let s = createSimulation();
    s = applyAndAdvance(s, [{ type: "fiatSpend", amount: 10, to: "households" }]).state;
    expect(() => postingsAtPeriod(s, -1)).toThrow(/out of bounds/i);
    expect(() => postingsAtPeriod(s, 2)).toThrow(/out of bounds/i);
    expect(() => economyViewAtPeriod(s, 2)).toThrow(/out of bounds/i);
  });
});

describe("history posting round-trip", () => {
  it("clonePostings matches current book after advance", () => {
    const a = applyAndAdvance(createSimulation(), [
      { type: "fiatSpend", amount: 42, to: "households" },
    ]).state;
    const p = currentPostings(a);
    const p2 = clonePostings(p);
    for (const id of Object.keys(p2) as Array<keyof typeof p2>) {
      expect(balance(p2, id)).toBe(balance(p, id));
    }
  });
});

describe("applyJournalLines", () => {
  it("rejects unbalanced journals", () => {
    const L = emptyPostings();
    expect(() =>
      applyJournalLines(L, [{ accountId: "hh.deposits", debit: 10, credit: 0 }])
    ).toThrow();
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
    assertClosedSystem(currentPostings(state));
  });

  it("holds for bank loan to households", () => {
    const { state } = applyAndAdvance(createSimulation(), [
      { type: "bankLoanHouseholds", amount: 50 },
    ]);
    assertClosedSystem(currentPostings(state));
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
      assertClosedSystem(currentPostings(s));
    }
  });
});

describe("economic semantics", () => {
  it("fiat spend increases household deposits and equity", () => {
    const { state } = applyAndAdvance(createSimulation(), [
      { type: "fiatSpend", amount: 100, to: "households" },
    ]);
    const p = currentPostings(state);
    expect(balance(p, "hh.deposits")).toBe(100);
    expect(balance(p, "hh.equity")).toBe(100);
    expect(balance(p, "treasury.equity")).toBe(-100);
  });

  it("bank loan does not change household net financial assets", () => {
    const { state } = applyAndAdvance(createSimulation(), [
      { type: "bankLoanHouseholds", amount: 100 },
    ]);
    const p = currentPostings(state);
    const hh =
      balance(p, "hh.deposits") + balance(p, "hh.bonds") - balance(p, "hh.loans");
    expect(hh).toBe(0);
  });

  it("primary bond sale moves bonds to banks and reserves to Treasury (via CB)", () => {
    let s = createSimulation();
    s = applyAndAdvance(s, [{ type: "fiatSpend", amount: 500, to: "households" }]).state;
    const reservesBefore = balance(currentPostings(s), "banks.reserves");
    s = applyAndAdvance(s, [{ type: "treasurySellBondsToBanks", amount: 100 }]).state;
    const p = currentPostings(s);
    expect(balance(p, "banks.bonds")).toBe(100);
    expect(balance(p, "banks.reserves")).toBe(reservesBefore - 100);
    expect(balance(p, "treasury.general_account")).toBe(-400);
    assertClosedSystem(p);
  });

  it("banks selling bonds to households destroys deposits", () => {
    let s = createSimulation();
    s = applyAndAdvance(s, [
      { type: "fiatSpend", amount: 200, to: "households" },
      { type: "treasurySellBondsToBanks", amount: 200 },
    ]).state;
    const depBefore = balance(currentPostings(s), "hh.deposits");
    s = applyAndAdvance(s, [{ type: "banksSellBondsToHouseholds", amount: 50 }]).state;
    const p = currentPostings(s);
    expect(balance(p, "hh.deposits")).toBe(depBefore - 50);
    expect(balance(p, "hh.bonds")).toBe(50);
  });
});

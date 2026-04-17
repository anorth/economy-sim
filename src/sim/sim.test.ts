import { describe, expect, it } from "vitest";
import { balanceDeltaFromLine } from "./accounts";
import {
  advanceOnly,
  applyAndAdvance,
  completedPeriodCount,
  createFinancialSimulation,
  currentPostings,
  ledgerEconomyViewAtPeriod,
  flattenActionLog,
  postingsAtPeriod,
  undoLastPeriod,
  validateFinancialSimulationState,
} from "./simulation";
import { assertClosedSystem } from "./invariants";
import { applyJournalLines, balance, clonePostings, emptyPostings } from "./postings";
import { linesForAction } from "./events";
import { hydrateFinancialSimulationState } from "./saveGame";
import {
  applyAutomatedPeriod,
  createAutomatedSimulation,
  undoAutomatedLastPeriod,
} from "./automated";
import { hydrateAutomatedSimulationState } from "./automatedSave";

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
    let s = createFinancialSimulation();
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
    let s = createFinancialSimulation();
    s = advanceOnly(s).state;
    expect(s.periods).toHaveLength(1);
    expect(s.periods[0]!.actions).toHaveLength(0);
    expect(s.periods[0]!.journalLines).toHaveLength(0);
  });
});

describe("undo last period (snapshot stack, no replay)", () => {
  it("restores postings from previous history frame", () => {
    let s = createFinancialSimulation();
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
    let s = createFinancialSimulation();
    s = advanceOnly(s).state;
    expect(completedPeriodCount(s)).toBe(1);
    expect(s.history).toHaveLength(2);
    s = undoLastPeriod(s);
    expect(completedPeriodCount(s)).toBe(0);
    expect(s.periods).toHaveLength(0);
    expect(s.history).toHaveLength(1);
  });

  it("is a no-op with nothing to undo", () => {
    const s = createFinancialSimulation();
    const t = undoLastPeriod(s);
    expect(t.periods).toHaveLength(0);
  });
});

describe("save game hydrate", () => {
  it("round-trips through JSON like localStorage would", () => {
    let s = createFinancialSimulation();
    s = applyAndAdvance(s, [{ type: "fiatSpend", amount: 25, to: "households" }]).state;
    const json = JSON.stringify(s);
    const back = hydrateFinancialSimulationState(JSON.parse(json) as unknown);
    expect(back.periods).toHaveLength(1);
    expect(balance(currentPostings(back), "hh.deposits")).toBe(
      balance(currentPostings(s), "hh.deposits")
    );
  });
});

describe("state validation and period bounds", () => {
  it("accepts a valid state", () => {
    let s = createFinancialSimulation();
    s = applyAndAdvance(s, [{ type: "fiatSpend", amount: 10, to: "households" }]).state;
    expect(() => validateFinancialSimulationState(s)).not.toThrow();
  });

  it("rejects inconsistent history length", () => {
    let s = createFinancialSimulation();
    s = applyAndAdvance(s, [{ type: "fiatSpend", amount: 10, to: "households" }]).state;
    const broken = { ...s, history: s.history.slice(1) };
    expect(() => validateFinancialSimulationState(broken)).toThrow(/history length/i);
  });

  it("rejects an unbalanced stored period journal", () => {
    let s = createFinancialSimulation();
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
    expect(() => validateFinancialSimulationState(broken)).toThrow(/invalid period/i);
  });

  it("checks period index bounds for postings and derived view", () => {
    let s = createFinancialSimulation();
    s = applyAndAdvance(s, [{ type: "fiatSpend", amount: 10, to: "households" }]).state;
    expect(() => postingsAtPeriod(s, -1)).toThrow(/out of bounds/i);
    expect(() => postingsAtPeriod(s, 2)).toThrow(/out of bounds/i);
    expect(() => ledgerEconomyViewAtPeriod(s, 2)).toThrow(/out of bounds/i);
  });
});

describe("history posting round-trip", () => {
  it("clonePostings matches current book after advance", () => {
    const a = applyAndAdvance(createFinancialSimulation(), [
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
      { type: "payWages" as const, amount: 1 },
      { type: "householdConsumption" as const, amount: 1 },
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
    const { state } = applyAndAdvance(createFinancialSimulation(), [
      { type: "fiatSpend", amount: 100, to: "households" },
    ]);
    assertClosedSystem(currentPostings(state));
  });

  it("holds for bank loan to households", () => {
    const { state } = applyAndAdvance(createFinancialSimulation(), [
      { type: "bankLoanHouseholds", amount: 50 },
    ]);
    assertClosedSystem(currentPostings(state));
  });

  it("holds for a chain: loan, fiat, tax, bonds, OMO, coupon, retail bond sale", () => {
    let s = createFinancialSimulation();
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
    const { state } = applyAndAdvance(createFinancialSimulation(), [
      { type: "fiatSpend", amount: 100, to: "households" },
    ]);
    const p = currentPostings(state);
    expect(balance(p, "hh.deposits")).toBe(100);
    expect(balance(p, "hh.equity")).toBe(100);
    expect(balance(p, "treasury.equity")).toBe(-100);
  });

  it("bank loan does not change household net financial assets", () => {
    const { state } = applyAndAdvance(createFinancialSimulation(), [
      { type: "bankLoanHouseholds", amount: 100 },
    ]);
    const p = currentPostings(state);
    const hh =
      balance(p, "hh.deposits") + balance(p, "hh.bonds") - balance(p, "hh.loans");
    expect(hh).toBe(0);
  });

  it("primary bond sale moves bonds to banks and reserves to Treasury (via CB)", () => {
    let s = createFinancialSimulation();
    s = applyAndAdvance(s, [{ type: "fiatSpend", amount: 500, to: "households" }]).state;
    const reservesBefore = balance(currentPostings(s), "banks.reserves");
    s = applyAndAdvance(s, [{ type: "treasurySellBondsToBanks", amount: 100 }]).state;
    const p = currentPostings(s);
    expect(balance(p, "banks.bonds")).toBe(100);
    expect(balance(p, "banks.reserves")).toBe(reservesBefore - 100);
    expect(balance(p, "treasury.cb_account")).toBe(-400);
    assertClosedSystem(p);
  });

  it("banks selling bonds to households destroys deposits", () => {
    let s = createFinancialSimulation();
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

describe("labour actions", () => {
  it("payWages moves deposits and equity between firms and households", () => {
    let s = createFinancialSimulation();
    s = applyAndAdvance(s, [{ type: "bankLoanFirms", amount: 100 }]).state;
    s = applyAndAdvance(s, [{ type: "payWages", amount: 40 }]).state;
    const p = currentPostings(s);
    expect(balance(p, "hh.deposits")).toBe(40);
    expect(balance(p, "firms.deposits")).toBe(60);
    assertClosedSystem(p);
  });

  it("householdConsumption moves deposits from households to firms", () => {
    let s = createFinancialSimulation();
    s = applyAndAdvance(s, [{ type: "fiatSpend", amount: 50, to: "households" }]).state;
    s = applyAndAdvance(s, [{ type: "householdConsumption", amount: 20 }]).state;
    const p = currentPostings(s);
    expect(balance(p, "hh.deposits")).toBe(30);
    expect(balance(p, "firms.deposits")).toBe(20);
    assertClosedSystem(p);
  });
});

describe("automated labour phase 1", () => {
  it("uses the explicit price level to convert money demand into real consumption", () => {
    let auto = createAutomatedSimulation(
      {
        fiatSpendToHouseholdsPerPeriod: 0,
        autoBorrowForPayroll: true,
        householdIncomeTaxRate: 0,
        consumptionPropensityFromDeposits: 0.75,
        salesExpectationAdaptation: 0.3,
      },
      {
        labourForce: 100,
        moneyWage: 100,
        priceLevel: 100,
        labourProductivity: 1,
        expectedSales: 80,
      }
    );
    auto = applyAutomatedPeriod(auto).state;
    expect(auto.realHistory[1]!.employment).toBe(80);
    expect(auto.realHistory[1]!.lastPeriodWageBill).toBe(8000);
    expect(auto.realHistory[1]!.lastPeriodConsumption).toBe(60);
    expect(balance(currentPostings(auto.financial), "hh.deposits")).toBe(2000);
  });

  it("runs a period as one action batch and keeps realHistory aligned", () => {
    let auto = createAutomatedSimulation({
      fiatSpendToHouseholdsPerPeriod: 0,
      autoBorrowForPayroll: true,
      householdIncomeTaxRate: 0,
      consumptionPropensityFromDeposits: 0.5,
    });
    expect(auto.realHistory).toHaveLength(1);
    expect(auto.financial.history).toHaveLength(1);
    auto = applyAutomatedPeriod(auto).state;
    expect(auto.financial.periods).toHaveLength(1);
    expect(auto.realHistory).toHaveLength(2);
    expect(auto.financial.history).toHaveLength(2);
    expect(auto.realHistory[1]!.employment).toBeGreaterThan(0);
    assertClosedSystem(currentPostings(auto.financial));
  });

  it("undo restores financial and real history together", () => {
    let auto = createAutomatedSimulation();
    const beforeReal = auto.realHistory[0]!.expectedSales;
    auto = applyAutomatedPeriod(auto).state;
    auto = undoAutomatedLastPeriod(auto);
    expect(auto.financial.periods).toHaveLength(0);
    expect(auto.realHistory).toHaveLength(1);
    expect(auto.realHistory[0]!.expectedSales).toBe(beforeReal);
  });

  it("round-trips automated save envelope JSON", () => {
    let auto = createAutomatedSimulation();
    auto = applyAutomatedPeriod(auto).state;
    const json = JSON.stringify(auto);
    const back = hydrateAutomatedSimulationState(JSON.parse(json) as unknown);
    expect(back.financial.periods).toHaveLength(1);
    expect(back.realHistory).toHaveLength(2);
    expect(back.realHistory[0]!.priceLevel).toBe(auto.realHistory[0]!.priceLevel);
    expect(balance(currentPostings(back.financial), "hh.deposits")).toBe(
      balance(currentPostings(auto.financial), "hh.deposits")
    );
  });
});

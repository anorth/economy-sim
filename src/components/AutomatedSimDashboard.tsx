"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LINE_CHART_ANIMATION_MS } from "./chartAnimation";
import {
  applyAutomatedPeriod,
  AUTOMATED_SLOT_ID,
  buildLedgerEconomyView,
  createAutomatedSimulation,
  currentPostings,
  currentReal,
  DEFAULT_LABOUR_PHASE1_POLICY,
  DEFAULT_REAL_ECONOMY_STATE,
  describeAction,
  flattenActionLog,
  ledgerEconomyAggregates,
  linesForAction,
  loadAutomatedSimulationFromBrowser,
  persistAutomatedSimulationToBrowser,
  undoAutomatedLastPeriod,
  type AutomatedSimulationState,
  type LabourPhase1Policy,
  type RealEconomyState,
} from "@/sim";

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtPct(n: number) {
  return `${(n * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function clampUnitInterval(n: number) {
  return Math.min(1, Math.max(0, n));
}

function MetricList({ children }: { children: ReactNode }) {
  return <dl className="mt-3 space-y-2 text-sm">{children}</dl>;
}

function MetricRow({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="min-w-0 flex-1 text-zinc-500">{label}</dt>
      <dd className="shrink-0 text-right font-mono">{value}</dd>
    </div>
  );
}

export function AutomatedSimDashboard() {
  const [state, setState] = useState<AutomatedSimulationState>(() => {
    return (
      loadAutomatedSimulationFromBrowser(AUTOMATED_SLOT_ID) ??
      createAutomatedSimulation()
    );
  });

  const simRef = useRef(state);
  useEffect(() => {
    simRef.current = state;
  }, [state]);
  const [initialPanelOpen, setInitialPanelOpen] = useState(false);

  const latest = useMemo(
    () =>
      buildLedgerEconomyView(
        currentPostings(state.financial),
        state.financial.periods.length
      ),
    [state]
  );

  const real = useMemo(() => currentReal(state), [state]);
  const initialReal = state.realHistory[0]!;
  const hasHistory = state.financial.periods.length > 0;
  const employmentRate = real.labourForce > 0 ? real.employment / real.labourForce : 0;

  const chartData = useMemo(() => {
    return state.financial.history.map((postings, periodIndex) => {
      const r = state.realHistory[periodIndex]!;
      return {
        period: periodIndex,
        ...ledgerEconomyAggregates(postings),
        employment: r.employment,
        expectedSales: r.expectedSales,
        lastConsumption: r.lastPeriodConsumption,
        wageBill: r.lastPeriodWageBill,
      };
    });
  }, [state]);

  const actionLog = useMemo(
    () => flattenActionLog(state.financial.periods.map((p) => p.actions)),
    [state.financial.periods]
  );

  const persist = useCallback((next: AutomatedSimulationState) => {
    setState(next);
    persistAutomatedSimulationToBrowser(AUTOMATED_SLOT_ID, next);
  }, []);

  const updatePolicy = useCallback(
    (patch: Partial<LabourPhase1Policy>) => {
      persist({
        ...state,
        policy: { ...state.policy, ...patch },
      });
    },
    [persist, state]
  );

  const updateInitialReal = useCallback(
    (patch: Partial<RealEconomyState>) => {
      const current = simRef.current;
      if (current.financial.periods.length > 0) return;
      const nextInitial = { ...current.realHistory[0]!, ...patch };
      persist({
        ...current,
        realHistory: [nextInitial],
      });
    },
    [persist]
  );

  const setInitialDefaults = useCallback(() => {
    const current = simRef.current;
    if (current.financial.periods.length > 0) return;
    persist({
      ...current,
      realHistory: [{ ...DEFAULT_REAL_ECONOMY_STATE }],
    });
  }, [persist]);

  const setPolicyDefaults = useCallback(() => {
    const current = simRef.current;
    persist({
      ...current,
      policy: { ...DEFAULT_LABOUR_PHASE1_POLICY },
    });
  }, [persist]);

  const stepMany = useCallback((count: number) => {
    let next = simRef.current;
    for (let i = 0; i < count; i++) {
      next = applyAutomatedPeriod(next).state;
    }
    persist(next);
  }, [persist]);

  const undo = useCallback(() => {
    persist(undoAutomatedLastPeriod(simRef.current));
  }, [persist]);

  const reset = useCallback(() => {
    const current = simRef.current;
    persist(createAutomatedSimulation(current.policy, current.realHistory[0]));
  }, [persist]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
      <header className="border-b border-zinc-200 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Automated simulation (labour-only)
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600">
              Policy-driven employment, wages, taxes, and consumption. Each period is one batch of
              explicit ledger actions; undo rewinds one period.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-emerald-800 underline-offset-4 hover:underline"
          >
            ← Home
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono">
            Period {latest.period}
          </span>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              Initial conditions
            </h2>
            <button
              type="button"
              className="shrink-0 text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
              onClick={() => setInitialPanelOpen((open) => !open)}
              aria-expanded={initialPanelOpen}
            >
              {initialPanelOpen ? "Hide" : "Show"}
            </button>
          </div>
          {initialPanelOpen && (
            <div className="mt-4 grid gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-zinc-500">Labour force</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  disabled={hasHistory}
                  className="rounded-md border border-zinc-300 px-3 py-2 font-mono disabled:bg-zinc-100"
                  value={initialReal.labourForce}
                  onChange={(e) =>
                    updateInitialReal({ labourForce: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-500">Initial employment</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  disabled={hasHistory}
                  className="rounded-md border border-zinc-300 px-3 py-2 font-mono disabled:bg-zinc-100"
                  value={initialReal.employment}
                  onChange={(e) =>
                    updateInitialReal({ employment: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-500">Money wage</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  disabled={hasHistory}
                  className="rounded-md border border-zinc-300 px-3 py-2 font-mono disabled:bg-zinc-100"
                  value={initialReal.moneyWage}
                  onChange={(e) =>
                    updateInitialReal({ moneyWage: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-500">Price level</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  disabled={hasHistory}
                  className="rounded-md border border-zinc-300 px-3 py-2 font-mono disabled:bg-zinc-100"
                  value={initialReal.priceLevel}
                  onChange={(e) =>
                    updateInitialReal({ priceLevel: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-500">Labour productivity</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  disabled={hasHistory}
                  className="rounded-md border border-zinc-300 px-3 py-2 font-mono disabled:bg-zinc-100"
                  value={initialReal.labourProductivity}
                  onChange={(e) =>
                    updateInitialReal({
                      labourProductivity: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-500">Initial expected sales</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  disabled={hasHistory}
                  className="rounded-md border border-zinc-300 px-3 py-2 font-mono disabled:bg-zinc-100"
                  value={initialReal.expectedSales}
                  onChange={(e) =>
                    updateInitialReal({
                      expectedSales: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
              </label>
              <div className="pt-1">
                <button
                  type="button"
                  disabled={hasHistory}
                  className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                  onClick={setInitialDefaults}
                >
                  Set default
                </button>
              </div>
            </div>
          )}
          <hr className="my-6 border-t border-zinc-200" />
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Policy & constants
          </h2>
          <div className="mt-4 grid gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Fiat spend to households / period</span>
              <input
                type="number"
                min={0}
                step="any"
                className="rounded-md border border-zinc-300 px-3 py-2 font-mono"
                value={state.policy.fiatSpendToHouseholdsPerPeriod}
                onChange={(e) =>
                  updatePolicy({
                    fiatSpendToHouseholdsPerPeriod: Number(e.target.value) || 0,
                  })
                }
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={state.policy.autoBorrowForPayroll}
                onChange={(e) => updatePolicy({ autoBorrowForPayroll: e.target.checked })}
              />
              Auto-borrow for payroll shortfall
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Household income tax rate (0–1)</span>
              <input
                type="number"
                min={0}
                max={1}
                step="any"
                className="rounded-md border border-zinc-300 px-3 py-2 font-mono"
                value={state.policy.householdIncomeTaxRate}
                onChange={(e) =>
                  updatePolicy({
                    householdIncomeTaxRate: clampUnitInterval(Number(e.target.value) || 0),
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Consumption propensity (of deposits, 0–1)</span>
              <input
                type="number"
                min={0}
                max={1}
                step="any"
                className="rounded-md border border-zinc-300 px-3 py-2 font-mono"
                value={state.policy.consumptionPropensityFromDeposits}
                onChange={(e) =>
                  updatePolicy({
                    consumptionPropensityFromDeposits: clampUnitInterval(
                      Number(e.target.value) || 0
                    ),
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Sales expectation adaptation (0–1)</span>
              <input
                type="number"
                min={0}
                max={1}
                step="any"
                className="rounded-md border border-zinc-300 px-3 py-2 font-mono"
                value={state.policy.salesExpectationAdaptation}
                onChange={(e) =>
                  updatePolicy({
                    salesExpectationAdaptation: clampUnitInterval(Number(e.target.value) || 0),
                  })
                }
              />
            </label>
          </div>
          <div className="mt-4">
            <button
              type="button"
              className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
              onClick={setPolicyDefaults}
            >
              Set default
            </button>
          </div>
          <div className="mt-6 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              className="rounded-md bg-emerald-800 px-4 py-2 text-sm text-white hover:bg-emerald-700"
              onClick={() => stepMany(1)}
            >
              Step
            </button>
            <button
              type="button"
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600"
              onClick={() => stepMany(10)}
            >
              +10
            </button>
            <button
              type="button"
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500"
              onClick={() => stepMany(100)}
            >
              +100
            </button>
            <button
              type="button"
              disabled={state.financial.periods.length === 0}
              className="rounded-md border border-amber-300 px-4 py-2 text-sm text-amber-900 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={undo}
            >
              Undo last period
            </button>
            <button
              type="button"
              className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
              onClick={reset}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Real economy (this period)
          </h2>
          <MetricList>
            <MetricRow label="Labour force" value={fmt(real.labourForce)} />
            <MetricRow label="Employment" value={fmt(real.employment)} />
            <MetricRow label="Employment rate" value={fmtPct(employmentRate)} />
            <MetricRow
              label="Labour productivity (output per labour unit)"
              value={fmt(real.labourProductivity)}
            />
            <MetricRow label="Money wage (cost per labour unit)" value={fmt(real.moneyWage)} />
            <MetricRow label="Price level" value={fmt(real.priceLevel)} />
            <MetricRow label="Expected sales (units)" value={fmt(real.expectedSales)} />
            <MetricRow label="Last output" value={fmt(real.lastPeriodOutput)} />
            <MetricRow label="Last wage bill" value={fmt(real.lastPeriodWageBill)} />
            <MetricRow label="Last consumption" value={fmt(real.lastPeriodConsumption)} />
          </MetricList>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Financial aggregates (ledger)
        </h2>
        <MetricList>
          <MetricRow label="Money supply" value={fmt(latest.aggregates.moneySupply)} />
          <MetricRow label="Private debt" value={fmt(latest.aggregates.privateDebt)} />
          <MetricRow label="Household equity" value={fmt(latest.aggregates.hhEquity)} />
          <MetricRow label="Firm equity" value={fmt(latest.aggregates.firmEquity)} />
        </MetricList>
      </section>

      <section className="rounded-xl border border-zinc-200 p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Time series</h2>
        <div className="mt-4 h-80 min-h-80 min-w-0 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="period" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="moneySupply"
                name="Money supply"
                stroke="#2563eb"
                dot={false}
                animationDuration={LINE_CHART_ANIMATION_MS}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="employment"
                name="Employment"
                stroke="#15803d"
                dot={false}
                animationDuration={LINE_CHART_ANIMATION_MS}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="lastConsumption"
                name="Consumption"
                stroke="#ca8a04"
                dot={false}
                animationDuration={LINE_CHART_ANIMATION_MS}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Generated action log
        </h2>
        {actionLog.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">Run a period to record actions.</p>
        ) : (
          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto font-mono text-xs">
            {actionLog.map((entry) => (
              <li key={entry.seq} className="border-b border-zinc-100 pb-2">
                <span className="text-zinc-400">
                  #{entry.seq + 1} · p{entry.periodAfter}
                </span>{" "}
                {describeAction(entry.action)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Last period — actions & journal lines
        </h2>
        {state.financial.periods.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No periods yet.</p>
        ) : (
          <div className="mt-3 max-h-96 space-y-4 overflow-y-auto">
            {state.financial.periods[state.financial.periods.length - 1]!.actions.map(
              (action, i) => (
                <div key={i} className="rounded-md border border-zinc-100 bg-zinc-50/80 p-3">
                  <div className="text-sm font-medium text-zinc-800">
                    {describeAction(action)}
                  </div>
                  <pre className="mt-2 overflow-x-auto text-xs text-zinc-700">
                    {JSON.stringify(linesForAction(action), null, 2)}
                  </pre>
                </div>
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}

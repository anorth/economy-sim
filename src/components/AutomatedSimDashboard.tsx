"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  applyAutomatedPeriod,
  AUTOMATED_SLOT_ID,
  buildLedgerEconomyView,
  createAutomatedSimulation,
  currentPostings,
  currentReal,
  describeAction,
  flattenActionLog,
  ledgerEconomyAggregates,
  linesForAction,
  loadAutomatedSimulationFromBrowser,
  persistAutomatedSimulationToBrowser,
  undoAutomatedLastPeriod,
  type AutomatedSimulationState,
  type LabourPhase1Policy,
} from "@/sim";

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
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

  const latest = useMemo(
    () =>
      buildLedgerEconomyView(
        currentPostings(state.financial),
        state.financial.periods.length
      ),
    [state]
  );

  const real = useMemo(() => currentReal(state), [state]);

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

  const runPeriod = useCallback(() => {
    persist(applyAutomatedPeriod(simRef.current).state);
  }, [persist]);

  const undo = useCallback(() => {
    persist(undoAutomatedLastPeriod(simRef.current));
  }, [persist]);

  const reset = useCallback(() => {
    persist(createAutomatedSimulation());
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
          <span className="text-zinc-600">
            Employment {fmt(real.employment)} / labour force {fmt(real.labourForce)}
          </span>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-4">
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
                    householdIncomeTaxRate: Math.min(
                      1,
                      Math.max(0, Number(e.target.value) || 0)
                    ),
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
                    consumptionPropensityFromDeposits: Math.min(
                      1,
                      Math.max(0, Number(e.target.value) || 0)
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
                    salesExpectationAdaptation: Math.min(
                      1,
                      Math.max(0, Number(e.target.value) || 0)
                    ),
                  })
                }
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              className="rounded-md bg-emerald-800 px-4 py-2 text-sm text-white hover:bg-emerald-700"
              onClick={runPeriod}
            >
              Run one period
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
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Money wage</dt>
            <dd className="text-right font-mono">{fmt(real.moneyWage)}</dd>
            <dt className="text-zinc-500">Labour productivity</dt>
            <dd className="text-right font-mono">{fmt(real.labourProductivity)}</dd>
            <dt className="text-zinc-500">Expected sales (units)</dt>
            <dd className="text-right font-mono">{fmt(real.expectedSales)}</dd>
            <dt className="text-zinc-500">Last wage bill</dt>
            <dd className="text-right font-mono">{fmt(real.lastPeriodWageBill)}</dd>
            <dt className="text-zinc-500">Last consumption</dt>
            <dd className="text-right font-mono">{fmt(real.lastPeriodConsumption)}</dd>
            <dt className="text-zinc-500">Last output</dt>
            <dd className="text-right font-mono">{fmt(real.lastPeriodOutput)}</dd>
          </dl>
          <p className="mt-4 text-xs text-zinc-500">
            Labour force, wage, and productivity are fixed in phase 1; edit initial real state in code
            or extend the UI later.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Financial aggregates (ledger)
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-zinc-500">Money supply</dt>
          <dd className="text-right font-mono">{fmt(latest.aggregates.moneySupply)}</dd>
          <dt className="text-zinc-500">Private debt</dt>
          <dd className="text-right font-mono">{fmt(latest.aggregates.privateDebt)}</dd>
          <dt className="text-zinc-500">Household equity</dt>
          <dd className="text-right font-mono">{fmt(latest.aggregates.hhEquity)}</dd>
          <dt className="text-zinc-500">Firm equity</dt>
          <dd className="text-right font-mono">{fmt(latest.aggregates.firmEquity)}</dd>
        </dl>
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
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="employment"
                name="Employment"
                stroke="#15803d"
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="lastConsumption"
                name="Consumption"
                stroke="#ca8a04"
                dot={false}
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

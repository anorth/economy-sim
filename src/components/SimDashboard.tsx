"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
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
  ACCOUNT_META,
  balanceDeltaFromLine,
  describeAction,
  linesForAction,
  applyAndAdvance,
  buildEconomyView,
  createSimulation,
  currentPostings,
  economyAggregates,
  flattenActionLog,
  undoLastPeriod,
  type AccountKind,
  type JournalLine,
  type SimAction,
  type SimulationState,
  sumSectorNetFinancialAssets,
} from "@/sim";

const ACTION_ORDER: SimAction["type"][] = [
  "fiatSpend",
  "tax",
  "bankLoanHouseholds",
  "bankLoanFirms",
  "repayLoanHouseholds",
  "repayLoanFirms",
  "treasurySellBondsToBanks",
  "cbBuyBondsFromBanks",
  "treasuryPayCouponToBanks",
  "banksSellBondsToHouseholds",
  "banksSellBondsToFirms",
];

const LABELS: Record<SimAction["type"], string> = {
  fiatSpend: "Fiat spend (Treasury → private sector)",
  tax: "Tax (private sector → Treasury)",
  bankLoanHouseholds: "Bank loan → households",
  bankLoanFirms: "Bank loan → firms",
  repayLoanHouseholds: "Repay loan (households)",
  repayLoanFirms: "Repay loan (firms)",
  treasurySellBondsToBanks: "Treasury sells bonds to banks (primary)",
  cbBuyBondsFromBanks: "CB buys bonds from banks (OMO)",
  treasuryPayCouponToBanks: "Treasury coupon payment → banks",
  banksSellBondsToHouseholds: "Banks sell bonds to households",
  banksSellBondsToFirms: "Banks sell bonds to firms",
};

function needsFiatTarget(t: SimAction["type"]): t is "fiatSpend" {
  return t === "fiatSpend";
}

function needsTaxFrom(t: SimAction["type"]): t is "tax" {
  return t === "tax";
}

function buildAction(
  type: SimAction["type"],
  amount: number,
  fiatTarget: "households" | "firms",
  taxFrom: "households" | "firms"
): SimAction {
  if (needsFiatTarget(type)) return { type, amount, to: fiatTarget };
  if (needsTaxFrom(type)) return { type, amount, from: taxFrom };
  return { type, amount } as SimAction;
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Consecutive lines in `linesForAction` are emitted as debit/credit pairs. */
function pairJournalLines(lines: JournalLine[]): Array<{ debit: JournalLine; credit: JournalLine }> {
  if (lines.length % 2 !== 0) {
    throw new Error(`Journal must have an even number of lines, got ${lines.length}`);
  }
  const pairs: Array<{ debit: JournalLine; credit: JournalLine }> = [];
  for (let i = 0; i < lines.length; i += 2) {
    const a = lines[i]!;
    const b = lines[i + 1]!;
    const aDr = a.debit > 0;
    const bDr = b.debit > 0;
    if (aDr && !bDr) pairs.push({ debit: a, credit: b });
    else if (!aDr && bDr) pairs.push({ debit: b, credit: a });
    else pairs.push({ debit: a, credit: b });
  }
  return pairs;
}

function formatSignedDelta(n: number): string {
  if (n === 0) return fmt(0);
  return n > 0 ? `+${fmt(n)}` : fmt(n);
}

/** Both postings in a debit/credit pair, bucketed by account kind (A/L/E). */
function splitPairByAle(pair: {
  debit: JournalLine;
  credit: JournalLine;
}): Record<AccountKind, Array<{ line: JournalLine; delta: number }>> {
  const buckets: Record<AccountKind, Array<{ line: JournalLine; delta: number }>> = {
    asset: [],
    liability: [],
    equity: [],
  };
  for (const line of [pair.debit, pair.credit]) {
    const kind = ACCOUNT_META[line.accountId].kind;
    const delta = balanceDeltaFromLine(kind, line);
    buckets[kind].push({ line, delta });
  }
  return buckets;
}

function AleHistoryCell({
  entries,
}: {
  entries: Array<{ line: JournalLine; delta: number }>;
}) {
  if (entries.length === 0) {
    return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  }
  return (
    <div className="flex flex-col gap-2 py-1">
      {entries.map(({ line, delta }, i) => (
        <div key={`${line.accountId}-${i}`} className="font-medium leading-snug text-zinc-900 dark:text-zinc-100" >
          <span className="font-mono text-sm font-normal tabular-nums text-zinc-700 dark:text-zinc-300">
            {formatSignedDelta(delta)}
          </span>
          &nbsp;
          ({ACCOUNT_META[line.accountId].label})
        </div>
      ))}
    </div>
  );
}

export function SimDashboard() {
  const [sim, setSim] = useState<SimulationState>(() => createSimulation());
  const [actionType, setActionType] = useState<SimAction["type"]>("fiatSpend");
  const [amount, setAmount] = useState("100");
  const [fiatTarget, setFiatTarget] = useState<"households" | "firms">("households");
  const [taxFrom, setTaxFrom] = useState<"households" | "firms">("households");
  const [queue, setQueue] = useState<SimAction[]>([]);

  const latest = useMemo(
    () => buildEconomyView(currentPostings(sim), sim.periods.length),
    [sim.history, sim.periods.length]
  );

  const actionLog = useMemo(
    () => flattenActionLog(sim.periods.map((p) => p.actions)),
    [sim.periods]
  );

  const chartData = useMemo(() => {
    return sim.history.map((postings, periodIndex) => ({
      period: periodIndex,
      ...economyAggregates(postings),
    }));
  }, [sim.history]);

  const sectorSum = useMemo(
    () => sumSectorNetFinancialAssets(currentPostings(sim)),
    [sim.history]
  );

  const addToQueue = useCallback(() => {
    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return;
    const next = buildAction(actionType, a, fiatTarget, taxFrom);
    setQueue((q) => [...q, next]);
  }, [actionType, amount, fiatTarget, taxFrom]);

  const runPeriod = useCallback(() => {
    setSim((s) => applyAndAdvance(s, queue).state);
    setQueue([]);
  }, [queue]);

  const advanceEmpty = useCallback(() => {
    setSim((s) => applyAndAdvance(s, []).state);
  }, []);

  const reset = useCallback(() => {
    setSim(createSimulation());
    setQueue([]);
  }, []);

  const undoPeriod = useCallback(() => {
    setSim((s) => undoLastPeriod(s));
  }, []);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight">Economy sim (SFC spike)</h1>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono dark:bg-zinc-900">
            Period {latest.period}
          </span>
          <span
            className={
              Math.abs(sectorSum) < 1e-3
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }
          >
            Σ sector (A − L) = {fmt(sectorSum)}
          </span>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Actions this period
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-500">Action</span>
              <select
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                value={actionType}
                onChange={(e) => setActionType(e.target.value as SimAction["type"])}
              >
                {ACTION_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-500">Amount</span>
              <input
                type="number"
                min={0}
                step="any"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono dark:border-zinc-700 dark:bg-zinc-950"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            {actionType === "fiatSpend" && (
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="ft"
                    checked={fiatTarget === "households"}
                    onChange={() => setFiatTarget("households")}
                  />
                  To households
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="ft"
                    checked={fiatTarget === "firms"}
                    onChange={() => setFiatTarget("firms")}
                  />
                  To firms
                </label>
              </div>
            )}
            {actionType === "tax" && (
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="tx"
                    checked={taxFrom === "households"}
                    onChange={() => setTaxFrom("households")}
                  />
                  From households
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="tx"
                    checked={taxFrom === "firms"}
                    onChange={() => setTaxFrom("firms")}
                  />
                  From firms
                </label>
              </div>
            )}
            <button
              type="button"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              onClick={addToQueue}
            >
              Add to queue
            </button>
            {queue.length > 0 && (
              <div className="space-y-2">
                <ul className="rounded-md border border-dashed border-zinc-300 p-3 text-sm dark:border-zinc-700">
                  {queue.map((a, i) => (
                    <li key={i} className="font-mono text-xs">
                      {JSON.stringify(a)}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-300"
                  onClick={() => setQueue([])}
                >
                  Clear queue
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={queue.length === 0}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={runPeriod}
              >
                Run period (apply queue & advance)
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
                onClick={advanceEmpty}
              >
                Advance period (no actions)
              </button>
              <button
                type="button"
                disabled={sim.periods.length === 0}
                className="rounded-md border border-amber-300 px-4 py-2 text-sm text-amber-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-800 dark:text-amber-200"
                onClick={undoPeriod}
              >
                Undo last period
              </button>
              <button
                type="button"
                className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-400"
                onClick={reset}
              >
                Reset simulation
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Aggregates</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Money supply (sum of deposits)</dt>
            <dd className="text-right font-mono">{fmt(latest.aggregates.moneySupply)}</dd>
            <dt className="text-zinc-500">Private debt (bank loans)</dt>
            <dd className="text-right font-mono">{fmt(latest.aggregates.privateDebt)}</dd>
            <dt className="text-zinc-500">Public debt (T. bonds outstanding)</dt>
            <dd className="text-right font-mono">{fmt(latest.aggregates.publicDebt)}</dd>
            <dt className="text-zinc-500">Bank reserves</dt>
            <dd className="text-right font-mono">{fmt(latest.aggregates.totalReserves)}</dd>
            <dt className="text-zinc-500">Treasury General Account</dt>
            <dd className="text-right font-mono">{fmt(latest.aggregates.generalAccount)}</dd>
          </dl>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Time series</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Stocks each period: money supply, private debt, public debt, and sector equity (households,
          firms, banks, Treasury).
        </p>
        <div className="mt-4 h-80 min-h-80 min-w-0 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="moneySupply"
                name="Money supply"
                stroke="#2563eb"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="privateDebt"
                name="Private debt"
                stroke="#ca8a04"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="publicDebt"
                name="Public debt"
                stroke="#dc2626"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="hhEquity"
                name="Household equity"
                stroke="#9333ea"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="firmEquity"
                name="Firm equity"
                stroke="#7c3aed"
                dot={false}
                strokeDasharray="4 4"
              />
              <Line
                type="monotone"
                dataKey="bankEquity"
                name="Bank equity"
                stroke="#0d9488"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="treasuryEquity"
                name="Treasury equity"
                stroke="#9f1239"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Action history</h2>
        {actionLog.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No actions recorded yet.</p>
        ) : (
          <div className="mt-4 flex max-h-[min(70vh,36rem)] flex-col gap-4 overflow-y-auto pr-1">
            {actionLog.map((entry) => {
              const lines = linesForAction(entry.action);
              const pairs = pairJournalLines(lines);
              return (
                <div
                  key={entry.seq}
                  className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
                >
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[52rem] text-left text-sm">
                      <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                        <tr>
                          <th className="w-[12rem] py-2 pl-3 pr-3 font-normal text-zinc-500">
                            Event
                          </th>
                          <th className="w-[8.5rem] py-2 pr-3 font-normal text-zinc-500">Sector</th>
                          <th className="min-w-[7rem] py-2 pr-3 font-normal text-zinc-500">Assets</th>
                          <th className="min-w-[7rem] py-2 pr-3 font-normal text-zinc-500">
                            Liabilities
                          </th>
                          <th className="min-w-[7rem] py-2 pr-3 font-normal text-zinc-500">Equity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pairs.map((pair, idx) => {
                          const ale = splitPairByAle(pair);
                          const sectorName = ACCOUNT_META[pair.debit.accountId].sector;
                          return (
                            <tr
                              key={`${entry.seq}-${idx}`}
                              className="border-b border-zinc-100 dark:border-zinc-800/80"
                            >
                              {idx === 0 && (
                                <td
                                  rowSpan={pairs.length}
                                  className="align-top border-r border-zinc-100 bg-zinc-50/80 py-2 pl-3 pr-3 dark:border-zinc-800 dark:bg-zinc-900/40"
                                >
                                  <div className="font-mono text-xs text-zinc-500">
                                    #{entry.seq + 1} · period {entry.periodAfter}
                                  </div>
                                  <div className="mt-1 font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                                    {describeAction(entry.action)}
                                  </div>
                                </td>
                              )}
                              <td className="align-top border-r border-zinc-100 py-2 pl-2 pr-3 text-sm font-medium text-zinc-800 dark:border-zinc-800 dark:text-zinc-200">
                                {sectorName}
                              </td>
                              <td className="align-top border-r border-zinc-50 py-1 pl-2 pr-3 dark:border-zinc-800/80">
                                <AleHistoryCell entries={ale.asset} />
                              </td>
                              <td className="align-top border-r border-zinc-50 py-1 pl-2 pr-3 dark:border-zinc-800/80">
                                <AleHistoryCell entries={ale.liability} />
                              </td>
                              <td className="align-top py-1 pl-2 pr-3">
                                <AleHistoryCell entries={ale.equity} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Sectors &amp; chart of accounts
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Each sector has a summary row (totals), then one row per account. Balances appear under
          Assets, Liabilities, or Equity by account type. A − L should match equity when the
          sector balances.
        </p>
        <div className="mt-4 max-h-[min(70vh,42rem)] overflow-auto rounded-md border border-zinc-100 dark:border-zinc-800">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
              <tr>
                <th className="py-2 pl-3 pr-4">Sector / account</th>
                <th className="py-2 pr-3 text-right font-normal">Assets</th>
                <th className="py-2 pr-3 text-right font-normal">Liabilities</th>
                <th className="py-2 pr-3 text-right font-normal">Equity</th>
                <th className="py-2 pr-3 text-right font-normal text-zinc-500">A − L</th>
              </tr>
            </thead>
            <tbody>
              {latest.sectors.map((s) => (
                <Fragment key={s.sector}>
                  <tr className="border-t border-zinc-200 bg-zinc-100/80 dark:border-zinc-700 dark:bg-zinc-800/50">
                    <td className="py-2.5 pl-3 pr-4 font-semibold tracking-tight">{s.sector}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-sm">{fmt(s.assets)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-sm">{fmt(s.liabilities)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-sm">{fmt(s.equity)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-sm text-zinc-600 dark:text-zinc-400">
                      {fmt(s.netFinancialAssets)}
                    </td>
                  </tr>
                  {s.accounts.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-zinc-100 dark:border-zinc-800/80"
                    >
                      <td className="py-1.5 pl-6 pr-4">
                        <span className="font-mono text-xs text-zinc-500">{a.id}</span>
                        <span className="text-zinc-400"> · </span>
                        <span className="text-zinc-700 dark:text-zinc-300">{a.label}</span>
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono text-xs">
                        {a.kind === "asset" ? fmt(a.balance) : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono text-xs">
                        {a.kind === "liability" ? fmt(a.balance) : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono text-xs">
                        {a.kind === "equity" ? fmt(a.balance) : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono text-xs text-zinc-400">
                        —
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

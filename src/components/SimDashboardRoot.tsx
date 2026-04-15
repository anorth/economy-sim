"use client";

import dynamic from "next/dynamic";

/**
 * Loads the dashboard only on the client so initial state can read `localStorage` without SSR
 * hydration mismatches.
 */
export const SimDashboardRoot = dynamic(
  () => import("./SimDashboard").then((m) => m.SimDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-zinc-500">Loading simulation…</div>
    ),
  }
);

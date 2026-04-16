"use client";

import dynamic from "next/dynamic";

export const AutomatedSimDashboardRoot = dynamic(
  () => import("./AutomatedSimDashboard").then((m) => m.AutomatedSimDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-zinc-500">
        Loading automated simulation…
      </div>
    ),
  }
);

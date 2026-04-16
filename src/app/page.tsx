import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-8 px-4 py-16">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Economy sim
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Stock-flow consistent macro experiments: manual ledger actions or an
          automated labour-only model.
        </p>
      </header>
      <nav className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/manual"
          className="rounded-lg border border-zinc-300 bg-white px-5 py-4 text-center text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50"
        >
          Manual simulation
          <span className="mt-1 block text-xs font-normal text-zinc-500">
            Queue explicit actions and advance one period at a time
          </span>
        </Link>
        <Link
          href="/automated"
          className="rounded-lg border border-emerald-800/20 bg-emerald-950 px-5 py-4 text-center text-sm font-medium text-white shadow-sm transition hover:bg-emerald-900"
        >
          Automated simulation
          <span className="mt-1 block text-xs font-normal text-emerald-200/90">
            Policy-driven labour, wages, consumption, and taxes
          </span>
        </Link>
      </nav>
    </div>
  );
}

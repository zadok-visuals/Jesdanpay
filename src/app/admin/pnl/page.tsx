import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/auth/admin";
import { Card } from "@/components/ui/Card";
import { formatBalance } from "@/lib/currency";
import { SupplierRateForm } from "@/components/admin/SupplierRateForm";
import type { Currency, SupplierRate } from "@/lib/types/database";
import type { AdminSearchParams } from "@/lib/admin/pagination";

// Every configured pair for realized-PNL reporting — CNY conversions (base = the non-CNY
// currency, quote = CNY) and USDT/fiat swaps (base = USDT, quote = the fiat currency). RMB manual
// transactions are deliberately excluded (confirmed with the client): their margin is an
// admin-entered actual_target_amount vs. a requested amount, not a live-quoted rate against a
// currency pair, so a "supplier buy rate" comparison doesn't apply.
const CNY_PAIRS: { base: Currency; quote: "CNY" }[] = [
  { base: "USDT", quote: "CNY" },
  { base: "NGN", quote: "CNY" },
  { base: "GHS", quote: "CNY" },
  { base: "KES", quote: "CNY" },
];
const SWAP_PAIRS: { base: "USDT"; quote: Currency }[] = [
  { base: "USDT", quote: "NGN" },
  { base: "USDT", quote: "GHS" },
  { base: "USDT", quote: "KES" },
];
const ALL_PAIRS = [...CNY_PAIRS, ...SWAP_PAIRS];

const PERIOD_OPTIONS = [
  { value: "1", label: "Today" },
  { value: "7", label: "This week" },
  { value: "30", label: "This month" },
  { value: "0", label: "All time" },
] as const;

function pairKey(base: string, quote: string) {
  return `${base}/${quote}`;
}

// The rate in effect for (base, quote) at time T — the row with the latest effective_from that's
// still <= T. supplierRates is the full history for the pair, already available in memory.
function rateAt(rates: SupplierRate[], base: string, quote: string, at: string): number | null {
  const candidates = rates
    .filter((r) => r.base_currency === base && r.quote_currency === quote && r.effective_from <= at)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return candidates[0]?.buy_rate ?? null;
}

export default async function AdminPnlPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  await requireAdminUser();
  const admin = createAdminClient();
  const params = await searchParams;
  const periodRaw = Array.isArray(params.period) ? params.period[0] : params.period;
  const periodDays = PERIOD_OPTIONS.some((o) => o.value === periodRaw) ? periodRaw! : "30";
  const periodCutoff = periodDays !== "0" ? new Date(Date.now() - Number(periodDays) * 24 * 60 * 60 * 1000).toISOString() : null;

  const [{ data: supplierRates }, { data: cnyConversions }, { data: swaps }] = await Promise.all([
    admin.from("supplier_rates").select("*").order("effective_from", { ascending: false }),
    (() => {
      let q = admin.from("cny_conversions").select("from_currency, from_amount, to_currency, to_amount, created_at");
      if (periodCutoff) q = q.gte("created_at", periodCutoff);
      return q;
    })(),
    (() => {
      let q = admin
        .from("transactions")
        .select("currency, amount, target_currency, target_amount, created_at")
        .eq("type", "usdt_ngn")
        .eq("status", "completed")
        .not("target_amount", "is", null);
      if (periodCutoff) q = q.gte("created_at", periodCutoff);
      return q;
    })(),
  ]);

  const rates = supplierRates ?? [];

  // Per-pair PNL accumulation. pnlContribution = (customerRate - supplierRate) * baseVolume, in
  // quote-currency units — positive means the customer was charged more (quote per base) than the
  // admin's own supplier cost for that pair at that time.
  const pnlByPair = new Map<string, { base: string; quote: string; pnl: number; volume: number; skipped: number }>();
  function addPnl(base: string, quote: string, pnl: number, volume: number) {
    const key = pairKey(base, quote);
    const entry = pnlByPair.get(key) ?? { base, quote, pnl: 0, volume: 0, skipped: 0 };
    entry.pnl += pnl;
    entry.volume += volume;
    pnlByPair.set(key, entry);
  }
  function skipPair(base: string, quote: string) {
    const key = pairKey(base, quote);
    const entry = pnlByPair.get(key) ?? { base, quote, pnl: 0, volume: 0, skipped: 0 };
    entry.skipped += 1;
    pnlByPair.set(key, entry);
  }

  // One row per underlying order feeding the aggregate above — same base/quote/volume/rate math,
  // just kept per-row instead of folded into the pnlByPair totals. buyRate is whatever rateAt
  // resolved for THIS order's own created_at (null when no supplier rate was on file yet, same
  // "skipped" condition as the aggregate).
  interface PerOrderRow {
    createdAt: string;
    base: string;
    quote: string;
    baseVolume: number;
    customerRate: number;
    buyRate: number | null;
  }
  const perOrderRows: PerOrderRow[] = [];

  for (const row of cnyConversions ?? []) {
    const isFromCny = row.from_currency === "CNY";
    const base = isFromCny ? row.to_currency : row.from_currency;
    const quote = "CNY";
    if (base === "CNY") continue; // shouldn't happen, both sides can't be CNY
    const customerRate = isFromCny ? row.from_amount / row.to_amount : row.to_amount / row.from_amount;
    const baseVolume = isFromCny ? row.to_amount : row.from_amount;
    const supplierRate = rateAt(rates, base, quote, row.created_at);
    perOrderRows.push({ createdAt: row.created_at, base, quote, baseVolume, customerRate, buyRate: supplierRate });
    if (supplierRate == null) {
      skipPair(base, quote);
      continue;
    }
    addPnl(base, quote, (customerRate - supplierRate) * baseVolume, baseVolume);
  }

  for (const row of swaps ?? []) {
    if (row.target_currency == null || row.target_amount == null) continue;
    const isSourceUsdt = row.currency === "USDT";
    const base = "USDT";
    const quote = isSourceUsdt ? row.target_currency : row.currency;
    if (quote === "USDT") continue; // shouldn't happen for usdt_ngn type
    const customerRate = isSourceUsdt ? row.target_amount / row.amount : row.amount / row.target_amount;
    const baseVolume = isSourceUsdt ? row.amount : row.target_amount;
    const supplierRate = rateAt(rates, base, quote, row.created_at);
    perOrderRows.push({ createdAt: row.created_at, base, quote, baseVolume, customerRate, buyRate: supplierRate });
    if (supplierRate == null) {
      skipPair(base, quote);
      continue;
    }
    addPnl(base, quote, (customerRate - supplierRate) * baseVolume, baseVolume);
  }

  perOrderRows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const pairResults = ALL_PAIRS.map(({ base, quote }) => pnlByPair.get(pairKey(base, quote)) ?? { base, quote, pnl: 0, volume: 0, skipped: 0 });
  const totalsByQuote = new Map<string, number>();
  for (const r of pairResults) totalsByQuote.set(r.quote, (totalsByQuote.get(r.quote) ?? 0) + r.pnl);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="mb-2 text-xl font-semibold">PNL</h1>
        <p className="mb-6 text-xs text-foreground/50">
          Best-effort reporting, same spirit as Markup Collected — not a certified accounting
          figure. A positive number means the customer was charged more (quote-currency per 1
          unit of base-currency) than your own supplier cost for that pair at that time; a pair
          with no supplier rate on file for the period is skipped and flagged below rather than
          silently treated as zero.
        </p>

        <div className="mb-6 flex gap-1 rounded-lg bg-black/[.04] p-1 text-xs font-medium">
          {PERIOD_OPTIONS.map((o) => (
            <Link
              key={o.value}
              href={`/admin/pnl?period=${o.value}`}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                periodDays === o.value ? "bg-white text-primary-700" : "text-foreground/60"
              }`}
            >
              {o.label}
            </Link>
          ))}
        </div>

        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap gap-6">
            {[...totalsByQuote.entries()].map(([quote, total]) => (
              <div key={quote}>
                <p className="text-xs text-foreground/50">Realized PNL ({quote})</p>
                <p className={`text-2xl font-bold ${total >= 0 ? "text-primary-700" : "text-danger-500"}`}>
                  {formatBalance(quote as Currency, total)}
                </p>
              </div>
            ))}
          </div>

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/40">
                <th className="py-2 pr-4 font-medium">Pair</th>
                <th className="py-2 pr-4 font-medium">Volume (base)</th>
                <th className="py-2 pr-4 font-medium">PNL (quote)</th>
                <th className="py-2 pr-4 font-medium">Skipped (no rate)</th>
              </tr>
            </thead>
            <tbody>
              {pairResults.map((r) => (
                <tr key={pairKey(r.base, r.quote)} className="border-b border-border last:border-0">
                  <td className="py-3 pr-4 font-semibold">
                    {r.base}/{r.quote}
                  </td>
                  <td className="py-3 pr-4">{formatBalance(r.base as Currency, r.volume)}</td>
                  <td className={`py-3 pr-4 font-semibold ${r.pnl >= 0 ? "" : "text-danger-500"}`}>
                    {formatBalance(r.quote as Currency, r.pnl)}
                  </td>
                  <td className="py-3 pr-4 text-foreground/50">{r.skipped > 0 ? `${r.skipped} transaction(s)` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <details className="mt-4 group">
          <summary className="cursor-pointer list-none text-sm font-medium text-primary-600 hover:underline">
            <span className="group-open:hidden">Show per-order breakdown ({perOrderRows.length})</span>
            <span className="hidden group-open:inline">Hide per-order breakdown</span>
          </summary>
          <Card className="mt-3 overflow-x-auto p-5">
            {perOrderRows.length === 0 ? (
              <p className="text-sm text-foreground/50">No orders in this period.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/40">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Pair</th>
                    <th className="py-2 pr-4 font-medium">Amount (base)</th>
                    <th className="py-2 pr-4 font-medium">Customer rate</th>
                    <th className="py-2 pr-4 font-medium">Buy rate used</th>
                  </tr>
                </thead>
                <tbody>
                  {perOrderRows.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 text-foreground/60">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="py-2 pr-4 font-semibold">
                        {r.base}/{r.quote}
                      </td>
                      <td className="py-2 pr-4">{formatBalance(r.base as Currency, r.baseVolume)}</td>
                      <td className="py-2 pr-4">{r.customerRate.toLocaleString("en-US", { maximumFractionDigits: 6 })}</td>
                      <td className="py-2 pr-4">
                        {r.buyRate == null ? (
                          <span className="text-foreground/40">No rate on file</span>
                        ) : (
                          r.buyRate.toLocaleString("en-US", { maximumFractionDigits: 6 })
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </details>
      </section>

      <section>
        <h1 className="mb-6 text-xl font-semibold">Supplier Rates</h1>
        <Card className="flex flex-col gap-4 p-5">
          <p className="text-xs text-foreground/50">
            What you pay your own supplier per pair — expressed as quote-currency per 1 unit of
            base-currency (e.g. CNY per 1 USDT). Adding a new rate doesn't change any live user
            rate — this is for PNL comparison only. A new rate is a new row; old ones stay for
            historical lookups.
          </p>

          <SupplierRateForm pairs={ALL_PAIRS} />

          {rates.length === 0 ? (
            <p className="text-sm text-foreground/50">No supplier rates on file yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/40">
                  <th className="py-2 pr-4 font-medium">Pair</th>
                  <th className="py-2 pr-4 font-medium">Buy rate</th>
                  <th className="py-2 pr-4 font-medium">Effective from</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4 font-semibold">
                      {r.base_currency}/{r.quote_currency}
                    </td>
                    <td className="py-3 pr-4">{r.buy_rate.toLocaleString("en-US", { maximumFractionDigits: 6 })}</td>
                    <td className="py-3 pr-4 text-foreground/50">{new Date(r.effective_from).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </div>
  );
}

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/auth/admin";
import { Card } from "@/components/ui/Card";
import { formatBalance } from "@/lib/currency";
import { SupplierRateForm } from "@/components/admin/SupplierRateForm";
import type { Currency, SupplierRate } from "@/lib/types/database";
import type { AdminSearchParams } from "@/lib/admin/pagination";

// Every realized-PNL figure in this page is expressed in USDT, because that's the one unit
// every route (CNY conversions started in any currency, USDT/fiat swaps, withdrawal fees in any
// currency) can be added to or compared against directly. The two bugs this rebuild fixes both
// came from NOT doing that:
//   1. CNY conversions were comparing a customer rate quoted in CNY-per-NGN terms directly against
//      a supplier rate entered in CNY-per-USDT terms — a straight unit mismatch, off by whatever
//      USDT happened to be worth in NGN that day (the 3M "loss" the client saw).
//   2. USDT/fiat swaps always computed (customerRate - supplierRate), which is only the right sign
//      for a customer BUYING USDT — for a customer SELLING USDT (giving us USDT, taking fiat),
//      receiving FEWER fiat units than our own supplier rate is a PROFIT, not a loss, so that case
//      needs the opposite sign.
// Fixing both required a supplier rate that's always "how many units of X per 1 USDT" — never a
// currency-to-currency cross rate the admin has no way to actually know or quote.
const FIAT_CURRENCIES: Currency[] = ["NGN", "KES", "GHS"];

const PERIOD_OPTIONS = [
  { value: "1", label: "Today" },
  { value: "7", label: "This week" },
  { value: "30", label: "This month" },
  { value: "0", label: "All time" },
] as const;

// Supabase/PostgREST caps a single response at 1000 rows — the "All time" view would silently
// under-count once total volume crossed that, with no error, no indication anything was cut off.
// This pages through with .range() until a page comes back shorter than a full page.
const FETCH_PAGE_SIZE = 1000;
async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + FETCH_PAGE_SIZE - 1);
    if (error) {
      console.error("[admin/pnl] paginated fetch failed", error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }
  return all;
}

// The USDT/<quote> rate in effect at time T — the row with the latest effective_from that's
// still <= T. supplierRates is the full history, already in memory.
function usdtRateAt(rates: SupplierRate[], quote: string, at: string): number | null {
  const candidates = rates
    .filter((r) => r.base_currency === "USDT" && r.quote_currency === quote && r.effective_from <= at)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return candidates[0]?.buy_rate ?? null;
}

function numberLabel(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

interface RouteStat {
  route: string;
  volumeCurrency: Currency;
  volume: number;
  pnlUsdt: number;
  skipped: number;
}

function addVolumeAndPnl(stats: Map<string, RouteStat>, route: string, volumeCurrency: Currency, volume: number, pnlUsdt: number) {
  const entry = stats.get(route) ?? { route, volumeCurrency, volume: 0, pnlUsdt: 0, skipped: 0 };
  entry.volume += volume;
  entry.pnlUsdt += pnlUsdt;
  stats.set(route, entry);
}
function addSkipped(stats: Map<string, RouteStat>, route: string, volumeCurrency: Currency) {
  const entry = stats.get(route) ?? { route, volumeCurrency, volume: 0, pnlUsdt: 0, skipped: 0 };
  entry.skipped += 1;
  stats.set(route, entry);
}

interface PerOrderRow {
  createdAt: string;
  route: string;
  paidLabel: string;
  gotLabel: string;
  customerRateLabel: string;
  supplierRateLabel: string;
  pnlUsdt: number | null;
}

export default async function AdminPnlPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  await requireAdminUser();
  const admin = createAdminClient();
  const params = await searchParams;
  const periodRaw = Array.isArray(params.period) ? params.period[0] : params.period;
  const periodDays = PERIOD_OPTIONS.some((o) => o.value === periodRaw) ? periodRaw! : "30";
  const periodCutoff = periodDays !== "0" ? new Date(Date.now() - Number(periodDays) * 24 * 60 * 60 * 1000).toISOString() : null;

  const [{ data: supplierRates }, { data: markupRate }, cnyConversions, swaps, withdrawals] = await Promise.all([
    admin.from("supplier_rates").select("*").order("effective_from", { ascending: false }),
    admin.from("cny_markup_rate").select("fiat_markup_rate, usdt_markup_rate").maybeSingle(),
    fetchAllRows<{
      from_currency: Currency;
      from_amount: number;
      to_currency: Currency;
      to_amount: number;
      busha_rate: number | null;
      created_at: string;
    }>((from, to) => {
      let q = admin
        .from("cny_conversions")
        .select("from_currency, from_amount, to_currency, to_amount, busha_rate, created_at")
        .order("created_at", { ascending: false });
      if (periodCutoff) q = q.gte("created_at", periodCutoff);
      return q.range(from, to);
    }),
    fetchAllRows<{
      currency: Currency;
      amount: number;
      target_currency: Currency | null;
      target_amount: number | null;
      created_at: string;
    }>((from, to) => {
      let q = admin
        .from("transactions")
        .select("currency, amount, target_currency, target_amount, created_at")
        .eq("type", "usdt_ngn")
        .eq("status", "completed")
        .not("target_amount", "is", null)
        .order("created_at", { ascending: false });
      if (periodCutoff) q = q.gte("created_at", periodCutoff);
      return q.range(from, to);
    }),
    fetchAllRows<{
      currency: Currency;
      amount: number;
      target_amount: number | null;
      created_at: string;
    }>((from, to) => {
      let q = admin
        .from("transactions")
        .select("currency, amount, target_amount, created_at")
        .eq("type", "withdrawal")
        .eq("status", "completed")
        .not("target_amount", "is", null)
        .order("created_at", { ascending: false });
      if (periodCutoff) q = q.gte("created_at", periodCutoff);
      return q.range(from, to);
    }),
  ]);

  const rates = supplierRates ?? [];
  const markupIsZero = markupRate != null && (markupRate.fiat_markup_rate === 0 || markupRate.usdt_markup_rate === 0);

  const routeStats = new Map<string, RouteStat>();
  const perOrderRows: PerOrderRow[] = [];
  let conversionPnlUsdt = 0;
  let swapPnlUsdt = 0;
  let withdrawalFeesUsdt = 0;
  let conversionSkipped = 0;
  let swapSkipped = 0;
  let withdrawalSkipped = 0;

  // ── CNY conversions ──────────────────────────────────────────────────────────────────────
  for (const row of cnyConversions) {
    const isFromCny = row.from_currency === "CNY";
    const nonCnyCurrency = isFromCny ? row.to_currency : row.from_currency;
    if (nonCnyCurrency === "CNY") continue; // shouldn't happen, both sides can't be CNY
    const route = `${nonCnyCurrency} to CNY`;

    // The realized non-CNY-side amount and the realized CNY-side amount, from the ledger as
    // actually recorded (not the pre-margin preview) — see migration/payments.ts for why these
    // are from_amount vs to_amount depending on direction.
    const nonCnyAmount = isFromCny ? row.to_amount : row.from_amount;
    const cnyAmount = isFromCny ? row.from_amount : row.to_amount;
    const customerRate = cnyAmount / nonCnyAmount; // CNY per 1 unit of nonCnyCurrency

    const usdtValue = nonCnyCurrency === "USDT" ? nonCnyAmount : row.busha_rate != null ? nonCnyAmount * row.busha_rate : null;
    const supplierRate = usdtRateAt(rates, "CNY", row.created_at);

    const supplierRateLabel = supplierRate != null ? `${numberLabel(supplierRate)} CNY/USDT` : "No rate on file";
    const paidLabel = formatBalance(row.from_currency, row.from_amount);
    const gotLabel = formatBalance(row.to_currency, row.to_amount);
    const customerRateLabel = `${numberLabel(customerRate)} CNY/${nonCnyCurrency}`;

    if (usdtValue == null || supplierRate == null) {
      conversionSkipped += 1;
      addSkipped(routeStats, route, nonCnyCurrency);
      perOrderRows.push({ createdAt: row.created_at, route, paidLabel, gotLabel, customerRateLabel, supplierRateLabel, pnlUsdt: null });
      continue;
    }

    const cnyCostUsdt = cnyAmount / supplierRate;
    const pnlUsdt = isFromCny ? cnyCostUsdt - usdtValue : usdtValue - cnyCostUsdt;
    conversionPnlUsdt += pnlUsdt;
    addVolumeAndPnl(routeStats, route, nonCnyCurrency, nonCnyAmount, pnlUsdt);
    perOrderRows.push({ createdAt: row.created_at, route, paidLabel, gotLabel, customerRateLabel, supplierRateLabel, pnlUsdt });
  }

  // ── USDT/fiat swaps ──────────────────────────────────────────────────────────────────────
  for (const row of swaps) {
    if (row.target_currency == null || row.target_amount == null) continue;
    const isSourceUsdt = row.currency === "USDT";
    const fiatCurrency = isSourceUsdt ? row.target_currency : row.currency;
    if (fiatCurrency === "USDT") continue; // shouldn't happen for this transaction type
    const route = `USDT to ${fiatCurrency}`;

    const customerRate = isSourceUsdt ? row.target_amount / row.amount : row.amount / row.target_amount; // fiat per 1 USDT
    const usdtAmount = isSourceUsdt ? row.amount : row.target_amount;
    const supplierRate = usdtRateAt(rates, fiatCurrency, row.created_at);

    const supplierRateLabel = supplierRate != null ? `${numberLabel(supplierRate)} ${fiatCurrency}/USDT` : "No rate on file";
    const paidLabel = formatBalance(row.currency, row.amount);
    const gotLabel = formatBalance(row.target_currency, row.target_amount);
    const customerRateLabel = `${numberLabel(customerRate)} ${fiatCurrency}/USDT`;

    if (supplierRate == null) {
      swapSkipped += 1;
      addSkipped(routeStats, route, "USDT");
      perOrderRows.push({ createdAt: row.created_at, route, paidLabel, gotLabel, customerRateLabel, supplierRateLabel, pnlUsdt: null });
      continue;
    }

    // A customer SELLING USDT (isSourceUsdt) who receives FEWER fiat units than our own supplier
    // rate is a profit for us, not a loss — the opposite sign from a customer BUYING USDT who
    // pays MORE fiat per USDT than our supplier rate. This is the sign the old page always got
    // backwards for the selling case.
    const pnlLocal = isSourceUsdt ? (supplierRate - customerRate) * usdtAmount : (customerRate - supplierRate) * usdtAmount;
    const pnlUsdt = pnlLocal / supplierRate;
    swapPnlUsdt += pnlUsdt;
    addVolumeAndPnl(routeStats, route, "USDT", usdtAmount, pnlUsdt);
    perOrderRows.push({ createdAt: row.created_at, route, paidLabel, gotLabel, customerRateLabel, supplierRateLabel, pnlUsdt });
  }

  // ── Withdrawal fees ──────────────────────────────────────────────────────────────────────
  // A flat 1% fee on every withdrawal (create_withdrawal_request, migration 0019) — fee income,
  // kept as its own line rather than folded into conversion/swap PNL since it isn't a rate spread
  // at all.
  for (const row of withdrawals) {
    if (row.target_amount == null) continue;
    const fee = row.amount - row.target_amount;
    const route = `withdrawals ${row.currency}`;
    const isUsdt = row.currency === "USDT";
    const supplierRate = isUsdt ? null : usdtRateAt(rates, row.currency, row.created_at);

    const paidLabel = formatBalance(row.currency, row.amount);
    const gotLabel = formatBalance(row.currency, row.target_amount);
    const supplierRateLabel = isUsdt ? "—" : supplierRate != null ? `${numberLabel(supplierRate)} ${row.currency}/USDT` : "No rate on file";

    if (!isUsdt && supplierRate == null) {
      withdrawalSkipped += 1;
      addSkipped(routeStats, route, row.currency);
      perOrderRows.push({ createdAt: row.created_at, route, paidLabel, gotLabel, customerRateLabel: "1% fee", supplierRateLabel, pnlUsdt: null });
      continue;
    }

    const usdtFee = isUsdt ? fee : fee / supplierRate!;
    withdrawalFeesUsdt += usdtFee;
    addVolumeAndPnl(routeStats, route, row.currency, row.amount, usdtFee);
    perOrderRows.push({ createdAt: row.created_at, route, paidLabel, gotLabel, customerRateLabel: "1% fee", supplierRateLabel, pnlUsdt: usdtFee });
  }

  perOrderRows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const totalPnlUsdt = conversionPnlUsdt + swapPnlUsdt + withdrawalFeesUsdt;
  const totalSkipped = conversionSkipped + swapSkipped + withdrawalSkipped;
  const routeResults = [...routeStats.values()].sort((a, b) => a.route.localeCompare(b.route));

  // USDT/CNY, plus USDT/<fiat> for each fiat currency this app actually has a wallet for — this
  // is now the ONLY set of pairs the admin can set a rate for (see the header comment above for
  // why NGN/CNY etc. no longer apply).
  const supplierPairs: { base: "USDT"; quote: Currency }[] = [
    { base: "USDT", quote: "CNY" },
    ...FIAT_CURRENCIES.map((quote) => ({ base: "USDT" as const, quote })),
  ];
  const legacyPairRows = rates.filter(
    (r) => !(r.base_currency === "USDT" && (r.quote_currency === "CNY" || FIAT_CURRENCIES.includes(r.quote_currency))),
  );

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="mb-2 text-xl font-semibold">PNL</h1>
        <p className="mb-2 text-xs text-foreground/50">
          Best-effort reporting, same spirit as Markup Collected — not a certified accounting
          figure. Every number here is converted to USDT so routes that start in different
          currencies can be added together and compared directly.
        </p>
        <ul className="mb-6 list-disc pl-4 text-xs text-foreground/50">
          <li>
            <strong className="font-medium text-foreground/70">CNY conversions:</strong> we convert
            whatever the customer paid (or received) into its USDT value, and separately work out
            what the CNY side would have cost us in USDT at the USDT/CNY supplier rate. The
            difference is the PNL for that order — it&rsquo;s never computed by comparing a CNY
            rate to a USDT rate directly, which is what produced the large apparent loss before
            this rebuild.
          </li>
          <li>
            <strong className="font-medium text-foreground/70">USDT/fiat swaps:</strong> a customer
            selling us USDT for fewer fiat units than our own supplier rate is a profit; a customer
            buying USDT from us for more fiat units than our supplier rate is also a profit. The
            sign flips depending on which side of the trade the customer is on.
          </li>
          <li>
            <strong className="font-medium text-foreground/70">Withdrawal fees:</strong> the flat 1%
            fee on every completed withdrawal, converted to USDT and shown as its own line — never
            mixed into conversion or swap PNL.
          </li>
          <li>
            A route with no supplier rate on file for the period it&rsquo;s skipped and flagged
            below, never silently counted as zero.
          </li>
        </ul>

        {markupIsZero && (
          <div className="mb-6 rounded-xl border border-accent-200 bg-accent-50 p-4 text-sm text-accent-900">
            Conversion markup is 0, so no margin is being collected on CNY conversions. Set it
            under Rates &amp; Markup.
          </div>
        )}

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

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-foreground/50">Total PNL (USDT)</p>
            <p className={`text-2xl font-bold ${totalPnlUsdt >= 0 ? "text-primary-700" : "text-danger-500"}`}>
              {formatBalance("USDT", totalPnlUsdt)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-foreground/50">Conversion PNL</p>
            <p className={`text-2xl font-bold ${conversionPnlUsdt >= 0 ? "text-primary-700" : "text-danger-500"}`}>
              {formatBalance("USDT", conversionPnlUsdt)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-foreground/50">Swap PNL</p>
            <p className={`text-2xl font-bold ${swapPnlUsdt >= 0 ? "text-primary-700" : "text-danger-500"}`}>
              {formatBalance("USDT", swapPnlUsdt)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-foreground/50">Withdrawal fees</p>
            <p className="text-2xl font-bold text-primary-700">{formatBalance("USDT", withdrawalFeesUsdt)}</p>
          </Card>
        </div>

        <Card className="flex flex-col gap-4 p-5">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/40">
                <th className="py-2 pr-4 font-medium">Route</th>
                <th className="py-2 pr-4 font-medium">Volume</th>
                <th className="py-2 pr-4 font-medium">PNL (USDT)</th>
                <th className="py-2 pr-4 font-medium">Skipped (no rate)</th>
              </tr>
            </thead>
            <tbody>
              {routeResults.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-foreground/50">
                    No orders in this period.
                  </td>
                </tr>
              ) : (
                routeResults.map((r) => (
                  <tr key={r.route} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4 font-semibold">{r.route}</td>
                    <td className="py-3 pr-4">{formatBalance(r.volumeCurrency, r.volume)}</td>
                    <td className={`py-3 pr-4 font-semibold ${r.pnlUsdt >= 0 ? "" : "text-danger-500"}`}>
                      {formatBalance("USDT", r.pnlUsdt)}
                    </td>
                    <td className="py-3 pr-4 text-foreground/50">{r.skipped > 0 ? `${r.skipped} order(s)` : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {totalSkipped > 0 && (
            <p className="text-xs text-foreground/50">
              {totalSkipped} order(s) across all routes had no supplier rate on file at their time
              and were excluded from every total above rather than counted as zero.
            </p>
          )}
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
                    <th className="py-2 pr-4 font-medium">Route</th>
                    <th className="py-2 pr-4 font-medium">Customer paid</th>
                    <th className="py-2 pr-4 font-medium">Customer got</th>
                    <th className="py-2 pr-4 font-medium">Customer rate</th>
                    <th className="py-2 pr-4 font-medium">Supplier rate used</th>
                    <th className="py-2 pr-4 font-medium">PNL (USDT)</th>
                  </tr>
                </thead>
                <tbody>
                  {perOrderRows.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 text-foreground/60">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="py-2 pr-4 font-semibold">{r.route}</td>
                      <td className="py-2 pr-4">{r.paidLabel}</td>
                      <td className="py-2 pr-4">{r.gotLabel}</td>
                      <td className="py-2 pr-4">{r.customerRateLabel}</td>
                      <td className="py-2 pr-4">
                        {r.supplierRateLabel === "No rate on file" ? (
                          <span className="text-foreground/40">No rate on file</span>
                        ) : (
                          r.supplierRateLabel
                        )}
                      </td>
                      <td className={`py-2 pr-4 font-semibold ${r.pnlUsdt == null ? "text-foreground/40" : r.pnlUsdt >= 0 ? "" : "text-danger-500"}`}>
                        {r.pnlUsdt == null ? "Skipped" : formatBalance("USDT", r.pnlUsdt)}
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
            What you actually pay your own supplier, always expressed per 1 USDT — never a direct
            currency-to-currency cross rate, since there&rsquo;s no way to really know or quote a
            NGN/CNY (or GHS/CNY, KES/CNY) rate on its own. Adding a new rate doesn&rsquo;t change
            any live customer rate — this is for PNL comparison only. A new rate is a new row; old
            ones stay for historical lookups.
          </p>

          <SupplierRateForm pairs={supplierPairs} />

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
                    <td className="py-3 pr-4">{numberLabel(r.buy_rate)}</td>
                    <td className="py-3 pr-4 text-foreground/50">{new Date(r.effective_from).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {legacyPairRows.length > 0 && (
            <p className="text-xs text-foreground/40">
              Rows for {[...new Set(legacyPairRows.map((r) => `${r.base_currency}/${r.quote_currency}`))].join(", ")}{" "}
              are historical and no longer used for PNL — CNY conversions are now always priced
              against USDT/CNY, regardless of which currency the customer paid in.
            </p>
          )}
        </Card>
      </section>
    </div>
  );
}

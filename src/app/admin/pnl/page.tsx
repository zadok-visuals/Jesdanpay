import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/auth/admin";
import { Card } from "@/components/ui/Card";
import { formatBalance } from "@/lib/currency";
import { SupplierRateForm } from "@/components/admin/SupplierRateForm";
import { computeAdminPnl, FIAT_CURRENCIES } from "@/lib/admin/pnl";
import type { Currency } from "@/lib/types/database";
import type { AdminSearchParams } from "@/lib/admin/pagination";

const PERIOD_OPTIONS = [
  { value: "1", label: "Today" },
  { value: "7", label: "This week" },
  { value: "30", label: "This month" },
  { value: "0", label: "All time" },
] as const;

function numberLabel(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export default async function AdminPnlPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  await requireAdminUser();
  const admin = createAdminClient();
  const params = await searchParams;
  const periodRaw = Array.isArray(params.period) ? params.period[0] : params.period;
  const periodDays = PERIOD_OPTIONS.some((o) => o.value === periodRaw) ? periodRaw! : "30";
  const periodCutoff = periodDays !== "0" ? new Date(Date.now() - Number(periodDays) * 24 * 60 * 60 * 1000).toISOString() : null;

  const {
    supplierRates: rates,
    markupRate,
    conversionPnlUsdt,
    swapPnlUsdt,
    withdrawalFeesUsdt,
    payToChinaPnlUsdt,
    totalPnlUsdt,
    totalSkipped,
    totalEstimated,
    payToChinaCnySourceCount,
    routeResults,
    perOrderRows,
  } = await computeAdminPnl(admin, periodCutoff);

  const markupIsZero = markupRate != null && (markupRate.fiat_markup_rate === 0 || markupRate.usdt_markup_rate === 0);

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
            <strong className="font-medium text-foreground/70">Pay to China:</strong> same
            discipline as CNY conversions — what the customer was debited (in their own currency)
            converted to USDT, minus what the CNY actually sent would have cost at the USDT/CNY
            supplier rate. A request spent from an already-locked CNY balance is noted, not
            double-counted, since that balance&rsquo;s PNL was already realized when it was
            converted.
          </li>
          <li>
            An order placed before you set your first supplier rate for that pair uses your
            earliest rate on file instead, marked{" "}
            <span className="rounded-full bg-accent-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-700">
              Estimated
            </span>{" "}
            rather than skipped.
          </li>
          <li>
            A route with no supplier rate on file AT ALL for the period is skipped and flagged
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

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
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
            <p className="text-xs text-foreground/50">Pay to China PNL</p>
            <p className={`text-2xl font-bold ${payToChinaPnlUsdt >= 0 ? "text-primary-700" : "text-danger-500"}`}>
              {formatBalance("USDT", payToChinaPnlUsdt)}
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
                    <td className="py-3 pr-4 font-semibold">
                      {r.route}
                      {r.note && <p className="mt-1 text-xs font-normal text-foreground/40">{r.note}</p>}
                    </td>
                    <td className="py-3 pr-4">{r.volume > 0 ? formatBalance(r.volumeCurrency, r.volume) : "—"}</td>
                    <td className={`py-3 pr-4 font-semibold ${r.pnlUsdt >= 0 ? "" : "text-danger-500"}`}>
                      {r.volume > 0 || r.pnlUsdt !== 0 ? formatBalance("USDT", r.pnlUsdt) : "—"}
                    </td>
                    <td className="py-3 pr-4 text-foreground/50">{r.skipped > 0 ? `${r.skipped} order(s)` : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {totalSkipped > 0 && (
            <p className="text-xs text-foreground/50">
              {totalSkipped} order(s) across all routes had no supplier rate on file (or, for Pay
              to China, no recorded CNY amount) at their time and were excluded from every total
              above rather than counted as zero.
            </p>
          )}
          {payToChinaCnySourceCount > 0 && (
            <p className="text-xs text-foreground/50">
              {payToChinaCnySourceCount} Pay to China order(s) in this period were spent from a
              locked CNY balance — their PNL was already counted when that CNY was converted, so
              they are not counted again here.
            </p>
          )}
          {totalEstimated > 0 && (
            <p className="text-xs text-foreground/50">
              {totalEstimated} order(s) used an estimated supplier rate (marked{" "}
              <span className="rounded-full bg-accent-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-700">
                Estimated
              </span>{" "}
              in the per-order breakdown below). Orders placed before your first supplier rate use
              your earliest rate on file.
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
                          <>
                            {r.supplierRateLabel}
                            {r.estimated && (
                              <span className="ml-1.5 rounded-full bg-accent-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-700">
                                Estimated
                              </span>
                            )}
                          </>
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

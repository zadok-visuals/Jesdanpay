import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { formatBalance } from "@/lib/currency";
import type { Currency } from "@/lib/types/database";
import { CnyTierRateForm } from "@/components/admin/CnyTierRateForm";
import { CnyMarkupForm } from "@/components/admin/CnyMarkupForm";
import type { AdminSearchParams } from "@/lib/admin/pagination";

const MARKUP_RANGE_OPTIONS = [7, 30, 90, 0] as const; // 0 = all time

export default async function AdminRatesPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const admin = createAdminClient();
  const params = await searchParams;
  const rangeDaysParam = Number(Array.isArray(params.markupDays) ? params.markupDays[0] : params.markupDays);
  const rangeDays = MARKUP_RANGE_OPTIONS.includes(rangeDaysParam as (typeof MARKUP_RANGE_OPTIONS)[number])
    ? rangeDaysParam
    : 30;
  const rangeCutoff = rangeDays > 0 ? new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString() : null;

  const [{ data: tierRates }, { data: markupRow }, { data: cnyConversionsForMarkup }, { data: swapsForMarkup }] =
    await Promise.all([
      admin.from("cny_tier_rates").select("*").order("tier_min_cny"),
      admin.from("cny_markup_rate").select("*").single(),
      (() => {
        let q = admin.from("cny_conversions").select("to_currency, to_amount, margin_rate, created_at");
        if (rangeCutoff) q = q.gte("created_at", rangeCutoff);
        return q;
      })(),
      (() => {
        let q = admin
          .from("transactions")
          .select("target_currency, target_amount, raw_target_amount, created_at")
          .eq("provider", "busha")
          .eq("type", "usdt_ngn")
          .not("raw_target_amount", "is", null);
        if (rangeCutoff) q = q.gte("created_at", rangeCutoff);
        return q;
      })(),
    ]);

  // Markup collected, by currency — cny_conversions already stores enough (to_amount and
  // margin_rate) to back out the pre-margin amount; swap transactions only have this since
  // migration 0025 added raw_target_amount, so older swap rows are excluded (they were never
  // charged a different rate, but the raw figure to compute the delta from no longer exists).
  const markupByCurrency = new Map<Currency, { cny: number; swap: number }>();
  function addMarkup(currency: Currency, key: "cny" | "swap", amount: number) {
    const entry = markupByCurrency.get(currency) ?? { cny: 0, swap: 0 };
    entry[key] += amount;
    markupByCurrency.set(currency, entry);
  }
  for (const row of cnyConversionsForMarkup ?? []) {
    if (row.margin_rate <= 0 || row.margin_rate >= 1) continue;
    const preMargin = row.to_amount / (1 - row.margin_rate);
    addMarkup(row.to_currency, "cny", preMargin - row.to_amount);
  }
  for (const row of swapsForMarkup ?? []) {
    if (row.target_currency == null || row.target_amount == null || row.raw_target_amount == null) continue;
    addMarkup(row.target_currency, "swap", row.raw_target_amount - row.target_amount);
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="mb-6 text-xl font-semibold">CNY Conversion Rates</h1>
        <Card className="flex flex-col gap-4 p-5">
          <p className="text-xs text-foreground/50">
            The USDT/CNY leg of the rate users convert against (before the margin is applied).
            Layered on top of Busha's live fiat/USDT rate to derive the fiat→CNY rate shown to
            users. Update as market conditions change.
          </p>
          <div className="flex flex-wrap gap-6">
            {(tierRates ?? []).map((tier) => (
              <CnyTierRateForm
                key={tier.tier_min_cny}
                tierMin={tier.tier_min_cny}
                tierMax={tier.tier_max_cny}
                usdtToCnyRate={tier.usdt_to_cny_rate}
              />
            ))}
          </div>
          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs text-foreground/50">
              Applied on top of the tiered rate above before it's shown to any user — the single
              markup Convert CNY and Pay to China both use, so they can never quote differently.
            </p>
            <CnyMarkupForm
              fiatMarkupRate={markupRow?.fiat_markup_rate ?? 0}
              usdtMarkupRate={markupRow?.usdt_markup_rate ?? 0}
            />
          </div>
        </Card>
      </section>

      <section>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Markup Collected</h1>
          <div className="flex gap-1 rounded-lg bg-black/[.04] p-1 text-xs font-medium">
            {MARKUP_RANGE_OPTIONS.map((days) => (
              <Link
                key={days}
                href={`/admin/rates?markupDays=${days}`}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  rangeDays === days ? "bg-white text-primary-700" : "text-foreground/60"
                }`}
              >
                {days === 0 ? "All time" : `${days}d`}
              </Link>
            ))}
          </div>
        </div>
        <Card className="flex flex-col gap-4 p-5">
          <p className="text-xs text-foreground/50">
            Revenue actually captured — the gap between Busha's real rate and what the customer was
            shown/credited, by currency. CNY conversions are computed from the stored margin on
            each row; swap markup is only available for transactions since this tracking shipped
            (older rows didn&rsquo;t record Busha&rsquo;s raw rate, so they&rsquo;re excluded here).
          </p>
          {markupByCurrency.size === 0 ? (
            <p className="text-sm text-foreground/50">No markup-bearing transactions in this range.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/40">
                  <th className="py-2 pr-4 font-medium">Currency</th>
                  <th className="py-2 pr-4 font-medium">CNY conversion markup</th>
                  <th className="py-2 pr-4 font-medium">Swap markup</th>
                  <th className="py-2 pr-4 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...markupByCurrency.entries()].map(([currency, { cny, swap }]) => (
                  <tr key={currency} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4 font-semibold">{currency}</td>
                    <td className="py-3 pr-4">{formatBalance(currency, cny)}</td>
                    <td className="py-3 pr-4">{formatBalance(currency, swap)}</td>
                    <td className="py-3 pr-4 font-semibold">{formatBalance(currency, cny + swap)}</td>
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

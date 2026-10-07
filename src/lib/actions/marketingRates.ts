"use server";

import { createClient } from "@/lib/supabase/server";
import { probeFiatToUsdtRate } from "@/lib/busha/rate";
import { computeConversionAmounts, type CnyTierRate } from "@/lib/cny/tiers";
import type { Currency } from "@/lib/types/database";

// Public, unauthenticated live-rate display for the marketing site (src/components/marketing/
// LiveRate.tsx). cny_tier_rates and cny_markup_rate are both public-readable (migrations
// 0022/0023/0029) and this mirrors src/lib/actions/payments.ts's own computation (
// computeConversionAmounts + the same margin math) exactly — it must NEVER read from
// supplier_rates, this app's internal cost-basis data, which has no read policy for
// anon/authenticated roles at all and is not queried here.

export interface LiveCnyRate {
  currency: Currency;
  // NGN/GHS/KES are quoted "1 CNY = [amount] [currency]" (from_cny) — a single NGN/KES is worth
  // a fraction of a fen of CNY, so quoting those the other way round at 1 unit would round to
  // ¥0.00 and look broken. USDT keeps its original "1 USDT = ¥[amount]" direction (to_cny).
  direction: "from_cny" | "to_cny";
  // from_cny: the fiat amount per 1 CNY. to_cny: the CNY amount per 1 USDT.
  amount: number;
}

// GHS deliberately excluded — Busha has no GHS pair on this account at all (confirmed live),
// so probing it always fails with a validation error, every ~55s, for every page view, forever.
// That's not a transient/real failure Promise.allSettled should be swallowing silently; it's a
// currency with no live-rate source at all. A manually-maintained GHS rate would be the correct
// fix (use it here with the same markup/staleness rules as the rest of this card), but no such
// feature exists in this codebase today — no manual_rates table, no admin GHS-rate screen,
// confirmed by searching the whole repo. Until one exists, GHS is simply omitted from this
// public card rather than probed and logged as a false "failure" on every call.
const FIAT_CURRENCIES: Currency[] = ["NGN", "KES"];

// probeFiatToUsdtRate creates a real quote against Busha's live API on every call — fine for an
// authenticated user changing a currency dropdown, not fine for an unauthenticated marketing page
// that could be polled continuously by any number of visitors (or scraped). This in-memory cache
// makes the real upstream call happen at most once per ~55s server-wide, no matter how many
// visitors are on the page, mirroring the same module-level-cache reasoning used for the Klasha
// token cache. On a refresh failure, the last known-good rates are served instead of an error, so
// a transient Busha hiccup doesn't blank out a public page.
let cachedRates: { rates: LiveCnyRate[]; fetchedAt: number } | null = null;
const RATE_CACHE_TTL_MS = 55_000;

// Settled independently rather than Promise.all'd — probeFiatToUsdtRate hits Busha's real API
// per currency, and a single pair failing (e.g. this account's real NGN/KES balance dipping below
// Busha's minimum tradeable amount, confirmed to happen live) shouldn't blank out the whole card
// when the other currencies quoted fine.
async function fetchFreshRates(tiers: CnyTierRate[], fiatMarkup: number, usdtMarkup: number): Promise<LiveCnyRate[]> {
  const settled = await Promise.allSettled([
    ...FIAT_CURRENCIES.map(async (currency): Promise<LiveCnyRate> => {
      const bushaRate = await probeFiatToUsdtRate(currency);
      const amounts = computeConversionAmounts("from_cny", 1, bushaRate, tiers);
      const amount = amounts ? Math.round(amounts.nonCnyAmount * (1 - fiatMarkup) * 100) / 100 : 0;
      return { currency, direction: "from_cny", amount };
    }),
    (async (): Promise<LiveCnyRate> => {
      const amounts = computeConversionAmounts("to_cny", 1, null, tiers);
      const amount = amounts ? Math.round(amounts.cnyAmount * (1 - usdtMarkup) * 100) / 100 : 0;
      return { currency: "USDT", direction: "to_cny", amount };
    })(),
  ]);

  return settled
    .filter((result): result is PromiseFulfilledResult<LiveCnyRate> => result.status === "fulfilled")
    .map((result) => result.value);
}

export async function getLiveCnyRates(): Promise<{ rates: LiveCnyRate[]; stale?: boolean } | { error: string }> {
  if (cachedRates && Date.now() - cachedRates.fetchedAt < RATE_CACHE_TTL_MS) {
    return { rates: cachedRates.rates };
  }

  const supabase = await createClient();
  const [{ data: tiers }, { data: markup }] = await Promise.all([
    supabase.from("cny_tier_rates").select("*"),
    supabase.from("cny_markup_rate").select("fiat_markup_rate, usdt_markup_rate").single(),
  ]);

  if (!tiers || tiers.length === 0) {
    if (cachedRates) return { rates: cachedRates.rates, stale: true };
    return { error: "Rates are not configured yet." };
  }

  try {
    const rates = await fetchFreshRates(tiers, markup?.fiat_markup_rate ?? 0, markup?.usdt_markup_rate ?? 0);
    if (rates.length === 0) throw new Error("Every currency quote failed");
    cachedRates = { rates, fetchedAt: Date.now() };
    return { rates };
  } catch {
    if (cachedRates) return { rates: cachedRates.rates, stale: true };
    return { error: "Live rates are temporarily unavailable." };
  }
}

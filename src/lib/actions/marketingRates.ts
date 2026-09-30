"use server";

import { createClient } from "@/lib/supabase/server";
import { probeFiatToUsdtRate } from "@/lib/busha/rate";
import { computeConversionAmounts, type CnyTierRate } from "@/lib/cny/tiers";
import type { Currency } from "@/lib/types/database";

// Public, unauthenticated live-rate display for the marketing site (src/components/marketing/
// LiveRate.tsx). cny_tier_rates and cny_markup_rate are both public-readable (migrations
// 0022/0023/0029) and this mirrors src/lib/actions/payments.ts's own "to_cny" computation
// (computeConversionAmounts + the same markup) exactly — it must NEVER read from supplier_rates,
// this app's internal cost-basis data, which has no read policy for anon/authenticated roles at
// all and is not queried here.

export interface LiveCnyRate {
  currency: Currency;
  // The quote quantity this rate is quoted for (e.g. 1,000 NGN, 1 USDT) rather than always "1
  // unit" — a single NGN/KES is worth a fraction of a fen of CNY, which rounds to ¥0.00 at 2
  // decimal places and would make the card look broken. Returned alongside cnyAmount so the
  // client never has to keep its own copy of these quantities in sync.
  quoteUnits: number;
  cnyAmount: number;
}

const QUOTE_UNITS: Record<Currency, number> = {
  NGN: 1000,
  GHS: 100,
  KES: 1000,
  USDT: 1,
  CNY: 1,
  USD: 1,
};

const DISPLAY_CURRENCIES: Currency[] = ["NGN", "GHS", "KES", "USDT"];

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
  const settled = await Promise.allSettled(
    DISPLAY_CURRENCIES.map(async (currency) => {
      const quoteUnits = QUOTE_UNITS[currency];
      const bushaRate = currency === "USDT" ? null : await probeFiatToUsdtRate(currency);
      const amounts = computeConversionAmounts("to_cny", quoteUnits, bushaRate, tiers);
      const margin = currency === "USDT" ? usdtMarkup : fiatMarkup;
      const cnyAmount = amounts ? Math.round(amounts.cnyAmount * (1 - margin) * 100) / 100 : 0;
      return { currency, quoteUnits, cnyAmount };
    }),
  );

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

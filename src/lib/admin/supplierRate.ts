import type { SupplierRate } from "@/lib/types/database";

export interface RateLookup {
  rate: number;
  // True when no supplier rate existed yet at the order's own time — the order was placed before
  // the admin ever entered a rate for this pair, so there's nothing genuinely "in effect" then.
  // The EARLIEST rate on file is used instead, as the closest available estimate, rather than
  // skipping the order entirely — flagged here so callers can show it as estimated instead of
  // silently presenting it as the real historical rate.
  estimated: boolean;
}

// The USDT/<quote> rate that applies to an order placed at time `at`:
//   1. The rate with the latest effective_from that's still <= `at` — the rate genuinely in
//      effect then, if one exists.
//   2. Otherwise, the EARLIEST rate on file for this pair (the order predates the admin's first
//      entry for it) — flagged `estimated: true`.
//   3. null only when there is no rate at all on file for this pair, ever — the only remaining
//      case worth skipping the order over, since there is nothing to base even an estimate on.
export function usdtRateAt(rates: SupplierRate[], quote: string, at: string): RateLookup | null {
  const pairRates = rates.filter((r) => r.base_currency === "USDT" && r.quote_currency === quote);
  if (pairRates.length === 0) return null;

  const inEffect = pairRates
    .filter((r) => r.effective_from <= at)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
  if (inEffect) return { rate: inEffect.buy_rate, estimated: false };

  const earliest = [...pairRates].sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1))[0];
  return { rate: earliest.buy_rate, estimated: true };
}

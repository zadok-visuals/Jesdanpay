export interface CnyTierRate {
  tier_min_cny: number;
  tier_max_cny: number;
  usdt_to_cny_rate: number;
}

function sortedTiers(tiers: CnyTierRate[]): CnyTierRate[] {
  return [...tiers].sort((a, b) => a.tier_min_cny - b.tier_min_cny);
}

// Reverse direction (CNY -> fiat/USDT): the CNY amount is already known up front, so the tier
// is picked directly by which band it falls into.
export function resolveReverseTier(cnyAmount: number, tiers: CnyTierRate[]): CnyTierRate | null {
  const sorted = sortedTiers(tiers);
  if (sorted.length === 0) return null;
  return (
    sorted.find((t) => cnyAmount >= t.tier_min_cny && cnyAmount <= t.tier_max_cny) ??
    sorted[sorted.length - 1]
  );
}

// Forward direction (fiat/USDT -> CNY): the CNY amount is the *output* of the rate we're
// choosing, so it's resolved in deterministic passes up the tier ladder — estimate the CNY
// amount using the current tier's rate, and if that estimate exceeds the tier's own ceiling,
// escalate to the next tier and re-check. This can't oscillate: a higher tier's rate only ever
// produces a *larger* CNY amount, so escalating never un-crosses a threshold it just crossed.
export function resolveForwardTier(usdtEquivalentAmount: number, tiers: CnyTierRate[]): CnyTierRate | null {
  const sorted = sortedTiers(tiers);
  if (sorted.length === 0) return null;
  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i];
    const estimate = usdtEquivalentAmount * tier.usdt_to_cny_rate;
    const isLastTier = i === sorted.length - 1;
    if (estimate <= tier.tier_max_cny || isLastTier) {
      return tier;
    }
  }
  return sorted[sorted.length - 1];
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type CnyDirection = "to_cny" | "from_cny";

export interface CnyConversionAmounts {
  cnyAmount: number;
  nonCnyAmount: number;
  tierRate: number;
}

// The one pure, framework-agnostic conversion formula — no I/O, no Busha calls — shared by the
// server (which fetches a live `bushaRate` via probeFiatToUsdtRate, then calls this) and the
// client (which caches a `bushaRate` fetched once per currency/direction change, then calls this
// exact same function on every keystroke for a truly instant, no-network "you'll receive" field).
// Having one implementation instead of two is what actually guarantees the preview a user sees
// while typing can never drift from what the server independently recomputes at commit time.
//
// `bushaRate` is "USDT per 1 unit of the non-CNY currency" (null when that currency is USDT
// itself, i.e. no fiat leg at all) — matches probeFiatToUsdtRate's fixed orientation regardless
// of direction (see that function's header comment for why it's never probed the other way).
export function computeConversionAmounts(
  direction: CnyDirection,
  amount: number,
  bushaRate: number | null,
  tiers: CnyTierRate[],
): CnyConversionAmounts | null {
  if (direction === "to_cny") {
    const usdtEquivalent = bushaRate != null ? amount * bushaRate : amount;
    const tier = resolveForwardTier(usdtEquivalent, tiers);
    if (!tier) return null;
    return {
      cnyAmount: round2(usdtEquivalent * tier.usdt_to_cny_rate),
      nonCnyAmount: amount,
      tierRate: tier.usdt_to_cny_rate,
    };
  }

  const tier = resolveReverseTier(amount, tiers);
  if (!tier) return null;
  const usdtEquivalent = amount / tier.usdt_to_cny_rate;
  const nonCnyAmount = bushaRate != null ? usdtEquivalent / bushaRate : usdtEquivalent;
  return {
    cnyAmount: amount,
    nonCnyAmount: round2(nonCnyAmount),
    tierRate: tier.usdt_to_cny_rate,
  };
}

export interface TierCurrencyEquivalent {
  // The tier's own rate, echoed back so the caller can label the first line "<N> CNY is about
  // ..." without re-reading tier.usdt_to_cny_rate itself.
  tierCnyAmount: number;
  // What tier.usdt_to_cny_rate CNY (i.e. exactly 1 USDT, by definition of the rate) is worth in
  // the selected currency — null while the live rate isn't available yet (still loading, or the
  // selected currency's rate hasn't resolved), never NaN/Infinity.
  approxInSelectedCurrency: number | null;
  // The plain 1 CNY -> selected currency figure, derived from the same number.
  oneCnyInSelectedCurrency: number | null;
}

// Shared by CnyConvertForm.tsx and RmbExchangeForm.tsx's "CNY pricing tiers" cards — both show
// each tier's own rate (e.g. "rate 6.6") and want a second, friendlier line underneath showing
// what that same number means in whichever currency the user actually has selected. Since
// tier.usdt_to_cny_rate CNY is, by definition, worth exactly 1 USDT at that tier, this is really
// just "1 USDT in the selected currency" — expressed this way so it reads naturally next to the
// tier's own displayed rate ("6.6 CNY is about ₦1,363.42") rather than introducing a separate,
// unrelated "1 USDT = ..." line. `usdtPerUnit` is USDT per 1 unit of the selected currency (same
// orientation as every other bushaRate in this codebase); pass 1 for USDT itself, or null/undefined
// while the live rate for a fiat currency hasn't loaded yet.
export function getTierCurrencyEquivalent(
  tier: CnyTierRate,
  usdtPerUnit: number | null | undefined,
): TierCurrencyEquivalent {
  const approxInSelectedCurrency =
    usdtPerUnit != null && usdtPerUnit > 0 ? round2(1 / usdtPerUnit) : null;
  const oneCnyInSelectedCurrency =
    approxInSelectedCurrency != null && tier.usdt_to_cny_rate > 0
      ? approxInSelectedCurrency / tier.usdt_to_cny_rate
      : null;
  return {
    tierCnyAmount: tier.usdt_to_cny_rate,
    approxInSelectedCurrency,
    oneCnyInSelectedCurrency,
  };
}

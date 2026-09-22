export interface CnyTierRate {
  tier_min_cny: number;
  tier_max_cny: number;
  usdt_to_cny_rate: number;
}

// Margin applied only at lock-in (never while just previewing a rate) — 2% for a fiat leg, 1%
// for a pure USDT leg. Keyed off whichever side of the conversion isn't CNY, regardless of
// direction — same rule the original CNY rate-lock feature established.
export function marginFor(nonCnyCurrency: string): number {
  return nonCnyCurrency === "USDT" ? 0.01 : 0.02;
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

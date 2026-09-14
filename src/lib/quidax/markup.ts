// 0.5% rate markup — confirmed by the client (see project memory: project_provider_research /
// the RMB margin conversation). Quidax is still asked to execute the swap at its real, unmarked
// rate; the customer is only ever shown and credited the marked-up (worse) amount, and the 0.5%
// gap between what Quidax actually delivers and what we credit stays as company revenue.
export const MARKUP_RATE = 0.005;

export function applyMarkup(rawTargetAmount: number): number {
  return rawTargetAmount * (1 - MARKUP_RATE);
}

export function formatEffectiveRate(
  sourceAmount: number,
  effectiveTargetAmount: number,
  sourceCurrency: string,
  targetCurrency: string,
): string {
  if (sourceAmount <= 0) return "—";
  const rate = effectiveTargetAmount / sourceAmount;
  return `1 ${sourceCurrency} ≈ ${rate.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${targetCurrency}`;
}

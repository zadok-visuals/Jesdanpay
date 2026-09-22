// 0.5% rate markup — confirmed by the client, applied to every automated conversion in the
// app (Busha swaps and Klasha CNY settlement alike). The provider is still asked to execute at
// its real, unmarked rate; the customer is only ever shown and credited the marked-up (worse)
// amount, and the gap between what the provider actually delivers and what we credit stays as
// company revenue.
export const MARKUP_RATE = 0.005;

export function applyMarkup(rawTargetAmount: number): number {
  return rawTargetAmount * (1 - MARKUP_RATE);
}

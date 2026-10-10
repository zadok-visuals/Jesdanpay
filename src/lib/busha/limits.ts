// Below this, Busha's own minimum rejects the request with a generic error after the user has
// already submitted — enforced client-side (disable submit, explain why) and server-side (can't
// be bypassed) in every conversion/swap flow: Convert USDT, Convert CNY (both directions), and the
// USDT/fiat exchange form. No imports of its own — safe to use from both client components and
// server actions.
export const MINIMUM_USDT_EQUIVALENT = 10;

// Round, friendly minimum amounts shown to the user INSTEAD of "Minimum amount must be equivalent
// to 10 USDT" — nobody thinks in USDT when they're about to spend NGN. Each figure is just above
// the 10 USDT equivalent at the rates in effect on 2026-10-10 (USDT/NGN ~1480, USDT/GHS ~14.5,
// USDT/KES ~1300, USDT/CNY ~7.1 on the lowest tier) — comfortably round, not a live computation.
// Easy to raise later; getMinimumConversionAmount below is what actually keeps these honest if
// real rates drift against them in the meantime.
export const MINIMUM_CONVERSION_AMOUNT: Record<"NGN" | "GHS" | "KES" | "USDT" | "CNY", number> = {
  NGN: 15000,
  GHS: 150,
  KES: 1500,
  USDT: 10,
  CNY: 100,
};

// The step a currency's minimum gets rounded UP to when the configured round figure above no
// longer clears the real 10 USDT floor (rates moved against it since 2026-10-10) — keeps the
// adjusted figure looking like a deliberately chosen number, not an ugly decimal.
const MINIMUM_ROUNDING_STEP: Record<"NGN" | "GHS" | "KES" | "USDT" | "CNY", number> = {
  NGN: 500,
  GHS: 10,
  KES: 100,
  USDT: 1,
  CNY: 10,
};

// The single source of truth for "minimum amount" messaging and gating, shared by every
// client-side disabled-state check and its matching server-side validation — called with the
// SAME currency and the SAME live usdtPerUnit (USDT per 1 unit of that currency; omit it only
// when no live rate is available yet, e.g. CNY, or while a fiat rate is still loading) so the two
// can never disagree about where the line is. Returns the configured round figure for that
// currency unless it would now fall under the real MINIMUM_USDT_EQUIVALENT floor, in which case
// it computes the exact amount that clears 10 USDT at the current rate and rounds it up to the
// next sensible step — so Busha's own minimum can never actually be violated even if the
// configured figures above go stale.
export function getMinimumConversionAmount(
  currency: "NGN" | "GHS" | "KES" | "USDT" | "CNY",
  usdtPerUnit?: number | null,
): number {
  const configured = MINIMUM_CONVERSION_AMOUNT[currency];
  if (!usdtPerUnit || usdtPerUnit <= 0) return configured;

  const configuredUsdtEquivalent = configured * usdtPerUnit;
  if (configuredUsdtEquivalent >= MINIMUM_USDT_EQUIVALENT) return configured;

  const exactRequired = MINIMUM_USDT_EQUIVALENT / usdtPerUnit;
  const step = MINIMUM_ROUNDING_STEP[currency];
  return Math.ceil(exactRequired / step) * step;
}

// Per-currency fiat deposit minimums. Below these, Busha's own minimum silently rejects (or in
// KES's case, previously just failed) the deposit after the user has already gone through the
// quote step — enforced client-side (disable submit, explain why) and server-side (can't be
// bypassed by calling getDepositQuote/initiateDeposit directly) in DepositForm.tsx/busha.ts.
//
// KES confirmed by the client's own live testing: deposits below 200 KES silently failed.
// NGN and GHS are deliberately left unset — nobody has confirmed an exact minimum for either with
// Busha support yet, and guessing a number here would either block legitimate small deposits or
// let through ones that still silently fail. Set these once confirmed; until then they're simply
// not enforced (undefined), matching today's behavior for every fiat currency.
export const FIAT_MINIMUM_DEPOSIT: Partial<Record<"NGN" | "GHS" | "KES", number>> = {
  KES: 200,
  // NGN: TBD — confirm with Busha support before setting.
  // GHS: TBD — confirm with Busha support before setting (also note GHS deposits route through
  // Klasha, not Busha, so this minimum would need separate confirmation from Klasha anyway).
};

// Busha support confirmed there's a minimum payout amount on their side too — a withdrawal below
// it fails with the same generic "Request validation failed" (see busha/client.ts's request()).
// 5 USDT is the figure support suggested testing with, not an official per-currency minimum from
// their docs — easy to raise later if they specify an exact one. Defined here (a plain leaf
// constant, safe for both client and server) rather than in automated-payout.ts directly, since
// that module imports the service-role admin client at module scope and must never be imported
// from a client component — automated-payout.ts re-exports this constant for visibility next to
// AUTOMATED_PAYOUT_USDT_THRESHOLD, but WithdrawForm.tsx imports it from here.
export const MINIMUM_WITHDRAWAL_USDT_THRESHOLD = 5;

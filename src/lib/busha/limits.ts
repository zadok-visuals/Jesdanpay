// Below this, Busha's own minimum rejects the request with a generic error after the user has
// already submitted — enforced client-side (disable submit, explain why) and server-side (can't
// be bypassed) in every conversion/swap flow: Convert USDT, Convert CNY (both directions), and the
// USDT/fiat exchange form. No imports of its own — safe to use from both client components and
// server actions.
export const MINIMUM_USDT_EQUIVALENT = 10;

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

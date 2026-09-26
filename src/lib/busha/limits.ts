// Below this, Busha's own minimum rejects the request with a generic error after the user has
// already submitted — enforced client-side (disable submit, explain why) and server-side (can't
// be bypassed) in every conversion/swap flow: Convert USDT, Convert CNY (both directions), and the
// USDT/fiat exchange form. No imports of its own — safe to use from both client components and
// server actions.
export const MINIMUM_USDT_EQUIVALENT = 10;

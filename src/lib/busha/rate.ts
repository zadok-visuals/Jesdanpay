import * as busha from "@/lib/busha/client";
import { BushaError } from "@/lib/busha/client";

// Busha's swap quotes validate against this account's *real* balance and a per-pair minimum
// (confirmed live: a 50,000 NGN probe failed "insufficient balance" against an account holding
// only ~1,800 NGN; a 100 NGN probe failed "The minimum sale amount is 262.05 NGN"). So a real
// amount can never be sent to Busha directly for a rate lookup — it could easily exceed either
// ceiling. Instead, probe with a tiny amount and fall back to whatever minimum Busha itself
// reports, then derive the rate as a plain ratio of the quote's own target_amount/source_amount
// — not by parsing rate.rate's string, whose orientation isn't guaranteed.
//
// Also confirmed live: this account holds real NGN but zero USDT, so a USDT-sourced probe fails
// "insufficient balance" at ANY amount, including the minimum — there's no probe amount that
// would ever work in that direction. So every rate lookup built on this always probes
// fiat -> USDT (never the reverse) and inverts the ratio when USDT -> fiat is what's actually
// needed — sidesteps depending on the account ever holding real USDT balance at all.
//
// Shared by the CNY rate engine (src/lib/actions/payments.ts) and the direct USDT<->fiat swap
// feature (src/lib/actions/busha.ts) — both need "the live rate for this pair," and both hit
// the exact same account constraints, so this is the one place that logic lives.
export async function probeFiatToUsdtRate(fiatCurrency: string): Promise<number> {
  async function quoteAt(amount: string, quiet = false) {
    const quote = await busha.createQuote({
      sourceCurrency: fiatCurrency,
      targetCurrency: "USDT",
      sourceAmount: amount,
      quiet,
    });
    return Number(quote.target_amount) / Number(quote.source_amount);
  }

  try {
    // Confirmed live: this 1-unit probe is rejected with a "minimum ... amount is X" message for
    // almost every pair — it's the expected, routine first step of discovering the real minimum,
    // not a genuine failure, so it runs quiet to avoid logging an "error" on every single call.
    return await quoteAt("1", true);
  } catch (err) {
    if (err instanceof BushaError) {
      // Busha's wording varies ("minimum sale amount", "Minimum trade amount") depending on
      // the pair — confirmed live for both — so match loosely on "minimum ... amount is X".
      const match = err.message.match(/minimum .*?amount is ([\d.]+)/i);
      // Retry at the real minimum NOT quiet — a failure here is no longer the routine case, so
      // it logs through request()'s own normal path same as before this change.
      if (match) return await quoteAt(match[1]);
    }
    // The 1-unit probe failed with something other than the expected "minimum amount" message —
    // not the routine case the quiet probe above was meant to swallow. That call was quiet, so
    // log it here instead, same discipline as any other real failure.
    console.error("[busha.rate] probeFiatToUsdtRate failed", { fiatCurrency, error: err });
    throw err;
  }
}

export interface UsdtPairRates {
  // Fiat cost to buy 1 USDT, and fiat received for selling 1 USDT — genuinely different numbers
  // (Busha's real bid/ask spread), not one rate inverted. See getPair's header comment for why
  // this endpoint (not /v1/quotes) is what makes the sell side obtainable at all.
  buyRate: number;
  sellRate: number;
}

// The direct USDT<->fiat swap feature (src/lib/actions/busha.ts, UsdtExchangeForm.tsx) needs a
// real rate for whichever direction the user actually picked — buying USDT with fiat uses
// Busha's buy price, selling USDT for fiat uses Busha's sell price. Returns null when Busha has
// no pair for this currency at all (confirmed live: GHS has no USDT pair on this account today).
export async function getUsdtPairRates(fiatCurrency: string): Promise<UsdtPairRates | null> {
  const pair = await busha.getPair("USDT", fiatCurrency);
  if (!pair) return null;
  return {
    buyRate: Number(pair.buy_price.amount),
    sellRate: Number(pair.sell_price.amount),
  };
}

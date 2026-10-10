import type { Currency } from "@/lib/types/database";

export const CURRENCY_META: Record<Currency, { flag: string; label: string; symbol: string }> = {
  USD: { flag: "🇺🇸", label: "US Dollar", symbol: "$" },
  NGN: { flag: "🇳🇬", label: "Nigerian Naira", symbol: "₦" },
  CNY: { flag: "🇨🇳", label: "Chinese Yuan", symbol: "¥" },
  USDT: { flag: "₮", label: "Tether USD", symbol: "₮" },
  GHS: { flag: "🇬🇭", label: "Ghanaian Cedi", symbol: "₵" },
  KES: { flag: "🇰🇪", label: "Kenyan Shilling", symbol: "KSh" },
};

// Single shared ordering for every currency picker/tab/list in the app — NGN, CNY, USDT, KES,
// GHS, with GHS always last since it's coming soon. Filter this (rather than writing an ad hoc
// array per component) so every list stays in sync and can't drift from this one.
export const CURRENCY_DISPLAY_ORDER: Currency[] = ["NGN", "CNY", "USDT", "KES", "GHS"];

export function formatBalance(currency: Currency, balance: number) {
  return `${CURRENCY_META[currency].symbol}${balance.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// GHS (Ghana) was only ever exercised against the Klasha sandbox, never a live account — every
// deposit/withdraw/convert/swap/send flow in the app checks this one list (client-side for the
// UI, server-side via isCurrencyAvailable so nothing can bypass the UI and submit anyway)
// instead of each independently hardcoding "GHS" — re-enabling it later is deleting one entry
// here, not hunting down every flow again.
export const COMING_SOON_CURRENCIES: Currency[] = ["GHS"];

export function isCurrencyAvailable(currency: Currency): boolean {
  return !COMING_SOON_CURRENCIES.includes(currency);
}

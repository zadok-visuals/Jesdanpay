import type { Currency } from "@/lib/types/database";

export const CURRENCY_META: Record<Currency, { flag: string; label: string; symbol: string }> = {
  USD: { flag: "🇺🇸", label: "US Dollar", symbol: "$" },
  NGN: { flag: "🇳🇬", label: "Nigerian Naira", symbol: "₦" },
  CNY: { flag: "🇨🇳", label: "Chinese Yuan", symbol: "¥" },
  USDT: { flag: "₮", label: "Tether USD", symbol: "₮" },
  GHS: { flag: "🇬🇭", label: "Ghanaian Cedi", symbol: "₵" },
  KES: { flag: "🇰🇪", label: "Kenyan Shilling", symbol: "KSh" },
};

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

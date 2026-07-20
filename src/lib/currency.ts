import type { Currency } from "@/lib/types/database";

export const CURRENCY_META: Record<Currency, { flag: string; label: string; symbol: string }> = {
  USD: { flag: "🇺🇸", label: "US Dollar", symbol: "$" },
  NGN: { flag: "🇳🇬", label: "Nigerian Naira", symbol: "₦" },
};

export function formatBalance(currency: Currency, balance: number) {
  return `${CURRENCY_META[currency].symbol}${balance.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

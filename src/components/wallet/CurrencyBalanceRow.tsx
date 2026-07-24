import type { Wallet } from "@/lib/types/database";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { Card } from "@/components/ui/Card";

export function CurrencyBalanceRow({ wallets }: { wallets: Wallet[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {wallets.map((wallet) => (
        <Card key={wallet.currency} className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xl">{CURRENCY_META[wallet.currency].flag}</span>
            <span className="text-sm font-medium text-foreground/60">
              {CURRENCY_META[wallet.currency].label}
            </span>
          </div>
          <p className="text-2xl font-bold tracking-tight">
            {formatBalance(wallet.currency, wallet.balance)}
          </p>
        </Card>
      ))}
    </div>
  );
}

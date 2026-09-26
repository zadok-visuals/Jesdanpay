"use client";

import { useState } from "react";
import type { Wallet } from "@/lib/types/database";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { QuickActions } from "@/components/wallet/QuickActions";

export function TotalBalanceCard({ wallets }: { wallets: Wallet[] }) {
  const currencies = wallets.map((w) => w.currency);
  const [selected, setSelected] = useState(currencies[0] ?? "NGN");
  const wallet = wallets.find((w) => w.currency === selected);

  return (
    <Card className="flex flex-col gap-8 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
      <div>
        <div className="mb-3 flex items-center gap-3">
          <p className="text-sm font-medium text-foreground/60">Balance</p>
          <Tabs options={currencies} value={selected} onChange={setSelected} />
        </div>
        <p className="text-4xl font-bold tracking-tight sm:text-5xl">
          {wallet ? formatBalance(wallet.currency, wallet.balance) : "—"}
        </p>
        <p className="mt-1 text-sm text-foreground/50">
          {wallet && CURRENCY_META[wallet.currency].label}
        </p>
      </div>

      <div className="hidden self-stretch border-l border-border sm:block" aria-hidden="true" />

      {/* One fixed 2x2 grid for all four actions — deliberately never sm:flex-row, so it can't
          spread into a single row as the card gets wider (that's what pushed the whole card wider
          than intended before). */}
      <div className="grid grid-cols-2 gap-3">
        <QuickActions />
      </div>
    </Card>
  );
}

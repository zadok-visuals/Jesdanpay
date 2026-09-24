"use client";

import { useState } from "react";
import type { Wallet } from "@/lib/types/database";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { QuickActionsPrimary, QuickActionsSecondary } from "@/components/wallet/QuickActions";

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

      {/* Primary | divider | secondary as one group so the outer Card's justify-between only
          ever balances two zones (balance vs. actions), not five flat children fighting for
          space. flex-wrap lets secondary drop to its own line at in-between desktop widths
          (confirmed live: four un-wrapped nowrap buttons overflow the card well into ordinary
          1366px laptop widths) rather than clipping past the card's edge. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-6 sm:gap-y-3">
        <QuickActionsPrimary />
        <div className="hidden self-stretch border-l border-border sm:block" aria-hidden="true" />
        <QuickActionsSecondary />
      </div>
    </Card>
  );
}

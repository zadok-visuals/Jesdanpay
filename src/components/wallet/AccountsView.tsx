"use client";

import { useState } from "react";
import type { Wallet } from "@/lib/types/database";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function AccountsView({ wallets }: { wallets: Wallet[] }) {
  const currencies = wallets.map((w) => w.currency);
  const [selected, setSelected] = useState(currencies[0] ?? "USD");
  const wallet = wallets.find((w) => w.currency === selected);

  if (!wallet) return null;

  return (
    <div className="flex flex-col gap-6">
      <Tabs options={currencies} value={selected} onChange={setSelected} />

      <Card className="p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="text-2xl">{CURRENCY_META[wallet.currency].flag}</span>
          <div>
            <p className="text-sm text-foreground/60">{CURRENCY_META[wallet.currency].label}</p>
            <p className="text-3xl font-bold tracking-tight">
              {formatBalance(wallet.currency, wallet.balance)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button disabled title="Coming soon — Milestone 2">
            Add Money
          </Button>
          <Button variant="secondary" disabled title="Coming soon — Milestone 2">
            Send Money
          </Button>
          <Button variant="secondary" disabled title="Coming soon — Milestone 2">
            Convert Funds
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 text-base font-semibold">
          {wallet.currency} receiving account
        </h2>
        <p className="text-sm text-foreground/50">
          Your dedicated {wallet.currency} account details will appear here once account
          provisioning is enabled (Milestone 2).
        </p>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
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

  const isCny = wallet.currency === "CNY";

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

        {isCny ? (
          <>
            {/* CNY-specific note */}
            <div className="mb-5 flex gap-3 rounded-xl border border-primary-200 bg-primary-50 p-4">
              <span className="mt-0.5 shrink-0 text-primary-500">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4" strokeLinecap="round" />
                  <path d="M12 16h.01" strokeLinecap="round" />
                </svg>
              </span>
              <p className="text-xs leading-relaxed text-primary-800">
                Converted CNY is stored here until you choose to send it. Rate is locked at
                conversion time — no re-conversion happens at send time.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button disabled title="Convert from NGN or USDT — Klasha Swap API, Milestone 2">
                Convert to CNY
              </Button>
              <Link href="/payments">
                <Button variant="secondary">
                  Send via RMB Exchange
                </Button>
              </Link>
            </div>
          </>
        ) : (
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
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 text-base font-semibold">
          {wallet.currency} receiving account
        </h2>
        <p className="text-sm text-foreground/50">
          {isCny
            ? "CNY is held in your JesDanPay balance. To send to a Chinese recipient, use the RMB Exchange flow in Payments."
            : `Your dedicated ${wallet.currency} account details will appear here once account provisioning is enabled (Milestone 2).`}
        </p>
      </Card>
    </div>
  );
}

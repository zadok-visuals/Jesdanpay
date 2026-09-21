"use client";

import { useState } from "react";
import Link from "next/link";
import type { Wallet } from "@/lib/types/database";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DepositForm } from "@/components/wallet/DepositForm";

export function AccountsView({ wallets }: { wallets: Wallet[] }) {
  const currencies = wallets.map((w) => w.currency);
  const [selected, setSelected] = useState(currencies[0] ?? "NGN");
  const [depositOpen, setDepositOpen] = useState(false);
  const wallet = wallets.find((w) => w.currency === selected);

  if (!wallet) return null;

  // Every wallet currency that still exists (NGN, GHS, KES, USDT) is depositable — USD and
  // CNY, the only two that weren't, are no longer provisioned at all (see migration 0012).
  const isUsdt = wallet.currency === "USDT";

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        options={currencies}
        value={selected}
        onChange={(c) => {
          setSelected(c);
          setDepositOpen(false);
        }}
      />

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

        {isUsdt ? (
          <>
            {/* USDT-specific note */}
            <div className="mb-5 flex gap-3 rounded-xl border border-primary-200 bg-primary-50 p-4">
              <span className="mt-0.5 shrink-0 text-primary-500">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4" strokeLinecap="round" />
                  <path d="M12 16h.01" strokeLinecap="round" />
                </svg>
              </span>
              <p className="text-xs leading-relaxed text-primary-800">
                Exchange USDT to or from NGN, GHS, or KES at a live rate, right from
                your balance.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setDepositOpen((o) => !o)}>
                {depositOpen ? "Cancel" : "Add Money"}
              </Button>
              <Link href="/payments?tab=usdt">
                <Button variant="secondary">Exchange USDT</Button>
              </Link>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setDepositOpen((o) => !o)}>
              {depositOpen ? "Cancel" : "Add Money"}
            </Button>
            <Link href="/payments">
              <Button variant="secondary">Send to China</Button>
            </Link>
            <Link href="/payments?tab=usdt">
              <Button variant="secondary">Exchange to USDT</Button>
            </Link>
          </div>
        )}

        {depositOpen && (
          <DepositForm
            currency={wallet.currency as "NGN" | "GHS" | "KES" | "USDT"}
            onClose={() => setDepositOpen(false)}
          />
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 text-base font-semibold">
          {wallet.currency} receiving account
        </h2>
        <p className="text-sm text-foreground/50">
          {isUsdt
            ? "USDT is held in your JesDanPay balance. Deposit directly, or use the USDT Exchange flow in Payments to convert to or from NGN, GHS, or KES."
            : `Use "Add Money" above to deposit ${wallet.currency} — your balance updates once the transfer is confirmed.`}
        </p>
      </Card>
    </div>
  );
}

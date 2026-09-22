"use client";

import { useState } from "react";
import Link from "next/link";
import type { Wallet, WithdrawalRecipient } from "@/lib/types/database";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DepositForm } from "@/components/wallet/DepositForm";
import { WithdrawForm } from "@/components/wallet/WithdrawForm";

export function AccountsView({
  wallets,
  withdrawalRecipient,
}: {
  wallets: Wallet[];
  withdrawalRecipient: WithdrawalRecipient | null;
}) {
  const currencies = wallets.map((w) => w.currency);
  const [selected, setSelected] = useState(currencies[0] ?? "NGN");
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const wallet = wallets.find((w) => w.currency === selected);

  if (!wallet) return null;

  // NGN/GHS/KES/USDT are depositable directly. CNY has no direct deposit path — it's only ever
  // funded via the rate-lock conversion (see the Convert to CNY tab in Payments) — so it gets
  // neither "Add Money" nor "Withdraw" here, only "Send to China" to spend the locked balance.
  const isUsdt = wallet.currency === "USDT";
  const isCny = wallet.currency === "CNY";
  const canWithdraw = !isCny;

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        options={currencies}
        value={selected}
        onChange={(c) => {
          setSelected(c);
          setDepositOpen(false);
          setWithdrawOpen(false);
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

        {isCny ? (
          <div className="flex flex-wrap gap-3">
            <Link href="/pay-to-china">
              <Button>Send to China</Button>
            </Link>
            <Link href="/payments?tab=cny">
              <Button variant="secondary">Convert more to CNY</Button>
            </Link>
          </div>
        ) : isUsdt ? (
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
              <Button variant="secondary" onClick={() => setWithdrawOpen((o) => !o)}>
                {withdrawOpen ? "Cancel" : "Withdraw"}
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
            <Button variant="secondary" onClick={() => setWithdrawOpen((o) => !o)}>
              {withdrawOpen ? "Cancel" : "Withdraw"}
            </Button>
            <Link href="/pay-to-china">
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

        {canWithdraw && withdrawOpen && (
          <WithdrawForm
            currency={wallet.currency}
            balance={wallet.balance}
            recipient={withdrawalRecipient}
            onClose={() => setWithdrawOpen(false)}
          />
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 text-base font-semibold">
          {wallet.currency} receiving account
        </h2>
        <p className="text-sm text-foreground/50">
          {isUsdt
            ? "USDT is held in your JesDanPay balance. Deposit directly, or use the USDT Exchange flow in Conversions to convert to or from NGN, GHS, or KES."
            : `Use "Add Money" above to deposit ${wallet.currency} — your balance updates once the transfer is confirmed.`}
        </p>
      </Card>
    </div>
  );
}

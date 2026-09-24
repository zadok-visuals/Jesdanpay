"use client";

import { useState } from "react";
import type { Wallet, WithdrawalRecipient } from "@/lib/types/database";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
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
  // Only one action panel (Deposit or Withdraw) can be open at a time — previously these were
  // two independent booleans, so both could be open together and each trigger button flipped to
  // "Cancel" on its own, making it impossible to tell which "Cancel" closed which panel.
  const [activePanel, setActivePanel] = useState<"deposit" | "withdraw" | null>(null);
  const wallet = wallets.find((w) => w.currency === selected);

  if (!wallet) return null;

  // NGN/GHS/KES/USDT are depositable directly. CNY has no direct deposit path — it's only ever
  // funded via the rate-lock conversion (see the Convert CNY tab in Conversions) — so it gets
  // neither "Add Money" nor "Withdraw" here, only "Send to China" to spend the locked balance.
  const isUsdt = wallet.currency === "USDT";
  const isCny = wallet.currency === "CNY";
  const canWithdraw = !isCny;
  const depositOpen = activePanel === "deposit";
  const withdrawOpen = activePanel === "withdraw";

  function toggleDeposit() {
    setActivePanel((p) => (p === "deposit" ? null : "deposit"));
  }
  function toggleWithdraw() {
    setActivePanel((p) => (p === "withdraw" ? null : "withdraw"));
  }

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        options={currencies}
        value={selected}
        onChange={(c) => {
          setSelected(c);
          setActivePanel(null);
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
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <LinkButton href="/pay-to-china" className="w-full sm:w-auto">
              Send to China
            </LinkButton>
            <LinkButton href="/payments?tab=cny" variant="secondary" className="w-full sm:w-auto">
              Convert more CNY
            </LinkButton>
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

            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
              <Button className="w-full sm:w-auto" onClick={toggleDeposit}>
                {depositOpen ? "Cancel" : "Add Money"}
              </Button>
              <Button variant="secondary" className="w-full sm:w-auto" onClick={toggleWithdraw}>
                {withdrawOpen ? "Cancel" : "Withdraw"}
              </Button>
              <LinkButton href="/payments?tab=usdt" variant="secondary" className="w-full sm:w-auto">
                Convert USDT
              </LinkButton>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <Button className="w-full sm:w-auto" onClick={toggleDeposit}>
              {depositOpen ? "Cancel" : "Add Money"}
            </Button>
            <Button variant="secondary" className="w-full sm:w-auto" onClick={toggleWithdraw}>
              {withdrawOpen ? "Cancel" : "Withdraw"}
            </Button>
            <LinkButton href="/pay-to-china" variant="secondary" className="w-full sm:w-auto">
              Send to China
            </LinkButton>
            <LinkButton href="/payments?tab=usdt" variant="secondary" className="w-full sm:w-auto">
              Convert USDT
            </LinkButton>
          </div>
        )}

        {depositOpen && (
          <DepositForm
            currency={wallet.currency as "NGN" | "GHS" | "KES" | "USDT"}
            onClose={() => setActivePanel(null)}
          />
        )}

        {canWithdraw && withdrawOpen && (
          <WithdrawForm
            currency={wallet.currency}
            balance={wallet.balance}
            recipient={withdrawalRecipient}
            onClose={() => setActivePanel(null)}
          />
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 text-base font-semibold">
          {wallet.currency} receiving account
        </h2>
        <p className="text-sm text-foreground/50">
          {isUsdt
            ? "USDT is held in your JesDanPay balance. Deposit directly, or use the Convert USDT flow in Conversions to convert to or from NGN, GHS, or KES."
            : `Use "Add Money" above to deposit ${wallet.currency} — your balance updates once the transfer is confirmed.`}
        </p>
      </Card>
    </div>
  );
}

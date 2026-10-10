"use client";

import { useRef, useState } from "react";
import type { Currency, Wallet, WithdrawalRecipient } from "@/lib/types/database";
import type { UnifiedActivity } from "@/lib/transactions";
import { CURRENCY_META, formatBalance, isCurrencyAvailable } from "@/lib/currency";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { DepositForm } from "@/components/wallet/DepositForm";
import { WithdrawForm } from "@/components/wallet/WithdrawForm";
import { TransactionsTable } from "@/components/transactions/TransactionsTable";

export function AccountsView({
  wallets,
  withdrawalRecipients,
  activityByCurrency,
}: {
  wallets: Wallet[];
  withdrawalRecipients: WithdrawalRecipient[];
  activityByCurrency: Record<Currency, UnifiedActivity[]>;
}) {
  const currencies = wallets.map((w) => w.currency);
  const [selected, setSelected] = useState(currencies[0] ?? "NGN");
  // The deposit panel always opens for whichever currency tab is already selected (there's no
  // separate tab to switch to), so "View balance" after a deposit just needs to bring the figure
  // back into view in case the user had scrolled down while the panel was open below it.
  const balanceRef = useRef<HTMLParagraphElement>(null);
  // Only one action panel (Deposit or Withdraw) can be open at a time — previously these were
  // two independent booleans, so both could be open together and each trigger button flipped to
  // "Cancel" on its own, making it impossible to tell which "Cancel" closed which panel.
  const [activePanel, setActivePanel] = useState<"deposit" | "withdraw" | null>(null);
  const wallet = wallets.find((w) => w.currency === selected);
  const recipient = withdrawalRecipients.find((r) => r.currency === selected) ?? null;

  if (!wallet) return null;

  // NGN/GHS/KES/USDT are depositable directly. CNY has no direct deposit path — it's only ever
  // funded via the rate-lock conversion (see the Convert CNY tab in Conversions) — so it gets
  // neither "Add Money" nor "Withdraw" here, only "Send to China" to spend the locked balance.
  const isUsdt = wallet.currency === "USDT";
  const isCny = wallet.currency === "CNY";
  // GHS was only ever exercised against the Klasha sandbox — every flow below (deposit,
  // withdraw, Send to China, Convert USDT) rejects it server-side too (see currency.ts's
  // COMING_SOON_CURRENCIES), so the whole action block is replaced with a plain notice instead of
  // showing buttons that would just error out one step later.
  const isGhs = !isCurrencyAvailable(wallet.currency);
  const canWithdraw = !isCny && !isGhs;
  const depositOpen = activePanel === "deposit" && !isGhs;
  const withdrawOpen = activePanel === "withdraw" && !isGhs;

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
        renderBadge={(c) =>
          !isCurrencyAvailable(c) ? (
            <span className="rounded-full bg-accent-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-700">
              Coming soon
            </span>
          ) : null
        }
      />

      <Card className="p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="text-2xl">{CURRENCY_META[wallet.currency].flag}</span>
          <div>
            <p className="text-sm text-foreground/60">{CURRENCY_META[wallet.currency].label}</p>
            <p ref={balanceRef} className="text-3xl font-bold tracking-tight">
              {formatBalance(wallet.currency, wallet.balance)}
            </p>
          </div>
        </div>

        {isGhs ? (
          <div className="rounded-xl border border-dashed border-border bg-black/[.02] p-5 text-center">
            <p className="text-sm font-medium text-foreground">Ghana (GHS) is coming soon.</p>
            <p className="mt-1 text-sm text-foreground/50">We will notify you as soon as it is available.</p>
          </div>
        ) : isCny ? (
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-col sm:gap-3">
            <div className="contents sm:flex sm:gap-3">
              <LinkButton href="/pay-to-china" className="w-full sm:min-w-[180px] sm:w-auto">
                Send to China
              </LinkButton>
            </div>
            <div className="contents sm:flex sm:gap-3">
              <LinkButton href="/payments?tab=cny" variant="secondary" className="w-full sm:min-w-[180px] sm:w-auto">
                Convert more CNY
              </LinkButton>
            </div>
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
                Convert USDT to or from NGN or KES at a live rate, right from your balance.
                GHS is coming soon.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-col sm:gap-3">
              <div className="contents sm:flex sm:gap-3">
                <Button className="w-full sm:min-w-[180px] sm:w-auto" onClick={toggleDeposit}>
                  {depositOpen ? "Cancel" : "Add Money"}
                </Button>
              </div>
              <div className="contents sm:flex sm:gap-3">
                <Button variant="secondary" className="w-full sm:min-w-[180px] sm:w-auto" onClick={toggleWithdraw}>
                  {withdrawOpen ? "Cancel" : "Withdraw"}
                </Button>
                <LinkButton href="/payments?tab=usdt" variant="secondary" className="w-full sm:min-w-[180px] sm:w-auto">
                  Convert USDT
                </LinkButton>
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-col sm:gap-3">
            <div className="contents sm:flex sm:gap-3">
              <Button className="w-full sm:min-w-[180px] sm:w-auto" onClick={toggleDeposit}>
                {depositOpen ? "Cancel" : "Add Money"}
              </Button>
              <LinkButton href="/pay-to-china" variant="secondary" className="w-full sm:min-w-[180px] sm:w-auto">
                Send to China
              </LinkButton>
            </div>
            <div className="contents sm:flex sm:gap-3">
              <Button variant="secondary" className="w-full sm:min-w-[180px] sm:w-auto" onClick={toggleWithdraw}>
                {withdrawOpen ? "Cancel" : "Withdraw"}
              </Button>
              <LinkButton href="/payments?tab=usdt" variant="secondary" className="w-full sm:min-w-[180px] sm:w-auto">
                Convert USDT
              </LinkButton>
            </div>
          </div>
        )}

        {depositOpen && (
          <DepositForm
            currency={wallet.currency as "NGN" | "GHS" | "KES" | "USDT"}
            onClose={() => setActivePanel(null)}
            onViewBalance={() => balanceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
          />
        )}

        {canWithdraw && withdrawOpen && (
          <WithdrawForm
            currency={wallet.currency}
            balance={wallet.balance}
            recipient={recipient}
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
            ? "USDT is held in your JesDanPay balance. Deposit directly, or use the Convert USDT flow in Conversions to convert to or from NGN or KES. GHS is coming soon."
            : isGhs
              ? "Ghana (GHS) is coming soon. We will notify you as soon as it is available."
              : `Use "Add Money" above to deposit ${wallet.currency} — your balance updates once the transfer is confirmed.`}
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold">{wallet.currency} activity</h2>
        <TransactionsTable transactions={activityByCurrency[wallet.currency] ?? []} />
      </Card>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestWithdrawal, type RequestWithdrawalState } from "@/lib/actions/withdrawals";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";
import { Input } from "@/components/ui/Input";
import type { Currency, WithdrawalRecipient } from "@/lib/types/database";

const WITHDRAWAL_FEE_RATE = 0.01;

export function WithdrawForm({
  currency,
  balance,
  recipient,
  onClose,
}: {
  currency: Currency;
  balance: number;
  recipient: WithdrawalRecipient | null;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [state, setState] = useState<RequestWithdrawalState>({});
  const [isPending, startTransition] = useTransition();

  const amountNum = parseFloat(amount) || 0;
  const fee = Math.round(amountNum * WITHDRAWAL_FEE_RATE * 100) / 100;
  const netAmount = amountNum - fee;
  const exceedsBalance = amountNum > 0 && amountNum > balance;
  const amountValid = amountNum > 0 && !exceedsBalance;
  const pinValid = /^\d{4,6}$/.test(pin);
  const submitDisabledReason =
    amountNum <= 0
      ? "Enter an amount to continue"
      : exceedsBalance
        ? `Amount exceeds your available ${currency} balance`
        : !pinValid
          ? "Enter your withdrawal PIN"
          : null;

  function handleSubmit() {
    const fd = new FormData();
    fd.set("currency", currency);
    fd.set("amount", amount);
    fd.set("pin", pin);
    startTransition(async () => {
      const result = await requestWithdrawal({}, fd);
      setState(result);
    });
  }

  if (!recipient) {
    return (
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Withdraw {currency}</p>
          <button type="button" onClick={onClose} className="text-xs text-foreground/50 hover:text-foreground">
            Close
          </button>
        </div>
        <p className="text-sm text-foreground/60">
          Add a payout recipient in Settings before you can withdraw.
        </p>
        <Link href="/settings">
          <Button variant="secondary">Go to Settings</Button>
        </Link>
      </div>
    );
  }

  if (recipient.currency !== currency) {
    return (
      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Withdraw {currency}</p>
          <button type="button" onClick={onClose} className="text-xs text-foreground/50 hover:text-foreground">
            Close
          </button>
        </div>
        <p className="text-sm text-foreground/60">
          Your saved payout recipient is for {recipient.currency}. You can only withdraw the
          currency your recipient is set up for.
        </p>
      </div>
    );
  }

  if (state.transactionId) {
    return (
      <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-border bg-white p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-2xl">✅</div>
        <div>
          <p className="text-base font-semibold">Withdrawal requested!</p>
          <p className="mt-1 text-sm text-foreground/60">
            We&rsquo;ve held the funds from your balance. Our team will process the payout to your
            saved recipient — track its status on the Transactions page.
          </p>
        </div>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Withdraw {currency}</p>
        <button type="button" onClick={onClose} className="text-xs text-foreground/50 hover:text-foreground">
          Close
        </button>
      </div>

      <div>
        <label htmlFor="withdrawAmount" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Amount ({currency})
        </label>
        <AmountInput
          id="withdrawAmount"
          symbol={CURRENCY_META[currency].symbol}
          value={amount}
          onChange={setAmount}
        />
        {exceedsBalance ? (
          <p className="mt-1.5 text-xs text-danger-500">
            Amount exceeds your available {currency} balance of {formatBalance(currency, balance)}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-foreground/50">
            Available: {formatBalance(currency, balance)}
          </p>
        )}
      </div>

      {amountNum > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-xl bg-primary-50 px-4 py-3.5">
          <div>
            <p className="text-xs text-primary-700/70">Fee (1%)</p>
            <p className="text-sm font-semibold text-primary-800">{formatBalance(currency, fee)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-primary-700/70">You'll receive</p>
            <p className="text-lg font-bold text-primary-800">{formatBalance(currency, netAmount)}</p>
          </div>
        </div>
      )}

      <Input
        label="Withdrawal PIN"
        id="withdrawPin"
        type="password"
        inputMode="numeric"
        maxLength={6}
        placeholder="4 to 6 digits"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
      />

      {state.error && <p className="text-sm text-danger-500">{state.error}</p>}

      <div className="flex flex-col items-start gap-1.5">
        <Button
          onClick={handleSubmit}
          loading={isPending}
          disabled={!amountValid || !pinValid}
          title={submitDisabledReason ?? undefined}
          className="self-start"
        >
          {isPending ? "Submitting…" : "Request withdrawal"}
        </Button>
        {submitDisabledReason && (
          <p className={`text-xs ${exceedsBalance ? "text-danger-500" : "text-foreground/50"}`}>
            {submitDisabledReason}
          </p>
        )}
      </div>
    </div>
  );
}

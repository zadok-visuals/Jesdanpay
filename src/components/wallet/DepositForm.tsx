"use client";

import { useState, useTransition } from "react";
import { getDepositQuote, initiateDeposit, type DepositQuoteState } from "@/lib/actions/quidax";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { Button } from "@/components/ui/Button";

export function DepositForm({ currency, onClose }: { currency: "NGN" | "GHS"; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [quoteState, setQuoteState] = useState<DepositQuoteState>({});
  const [depositError, setDepositError] = useState<string | undefined>();
  const [isQuoting, startQuoting] = useTransition();
  const [isDepositing, startDepositing] = useTransition();

  function handleGetQuote() {
    const fd = new FormData();
    fd.set("currency", currency);
    fd.set("amount", amount);
    startQuoting(async () => {
      const result = await getDepositQuote({}, fd);
      setQuoteState(result);
      setDepositError(undefined);
    });
  }

  function handleDeposit() {
    startDepositing(async () => {
      const result = await initiateDeposit({}, new FormData());
      setDepositError(result.error);
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Add {currency}</p>
        <button type="button" onClick={onClose} className="text-xs text-foreground/50 hover:text-foreground">
          Close
        </button>
      </div>

      <div>
        <label htmlFor="depositAmount" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Amount ({currency})
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-foreground/50">
            {CURRENCY_META[currency].symbol}
          </span>
          <input
            id="depositAmount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setQuoteState({});
            }}
            placeholder="0.00"
            className="h-11 w-full rounded-xl border border-border bg-white pl-8 pr-3.5 text-base outline-none transition-colors focus:border-primary-400 sm:text-sm"
          />
        </div>
      </div>

      {quoteState.error && <p className="text-sm text-danger-500">{quoteState.error}</p>}

      {quoteState.toAmount ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <dl className="divide-y divide-border">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-sm text-foreground/60">You&rsquo;ll receive (est.)</dt>
              <dd className="text-sm font-medium">{quoteState.toAmount} USDT</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-sm text-foreground/60">Fee</dt>
              <dd className="text-sm font-medium">{formatBalance(currency, Number(quoteState.fee))}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {depositError && <p className="text-sm text-danger-500">{depositError}</p>}

      <div className="flex gap-3">
        {!quoteState.toAmount ? (
          <Button
            onClick={handleGetQuote}
            loading={isQuoting}
            disabled={!amount || Number(amount) <= 0}
            className="self-start"
          >
            Preview
          </Button>
        ) : (
          <Button onClick={handleDeposit} loading={isDepositing} className="self-start">
            Deposit now
          </Button>
        )}
      </div>
    </div>
  );
}

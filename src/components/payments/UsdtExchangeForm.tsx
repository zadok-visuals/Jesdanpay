"use client";

import { useEffect, useState, useTransition } from "react";
import type { Wallet } from "@/lib/types/database";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { getSwapQuote, confirmSwap, type QuidaxActionState } from "@/lib/actions/quidax";
import type { Currency } from "@/lib/types/database";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type Direction = "USDT_TO_NGN" | "NGN_TO_USDT" | "USDT_TO_GHS" | "GHS_TO_USDT";

const DIRECTIONS: { value: Direction; source: Currency; target: Currency; label: string }[] = [
  { value: "NGN_TO_USDT", source: "NGN", target: "USDT", label: "NGN → USDT" },
  { value: "USDT_TO_NGN", source: "USDT", target: "NGN", label: "USDT → NGN" },
  { value: "GHS_TO_USDT", source: "GHS", target: "USDT", label: "GHS → USDT" },
  { value: "USDT_TO_GHS", source: "USDT", target: "GHS", label: "USDT → GHS" },
];

function useCountdown(expiresAt: string | undefined) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      setSecondsLeft(Math.max(diff, 0));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return secondsLeft;
}

function SuccessScreen({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-3xl">✅</div>
      <div>
        <p className="text-base font-semibold">Exchange submitted!</p>
        <p className="mt-1 text-sm text-foreground/60">
          Your funds will appear once Quidax confirms the exchange — usually within minutes. Track its
          status on the Transactions page.
        </p>
      </div>
      <Button variant="secondary" onClick={onReset}>
        New exchange
      </Button>
    </div>
  );
}

export function UsdtExchangeForm({ wallets }: { wallets: Wallet[] }) {
  const [direction, setDirection] = useState<Direction>("NGN_TO_USDT");
  const [amount, setAmount] = useState("");
  const [quoteState, setQuoteState] = useState<QuidaxActionState>({});
  const [confirmState, setConfirmState] = useState<QuidaxActionState>({});
  const [done, setDone] = useState(false);
  const [isQuoting, startQuoting] = useTransition();
  const [isConfirming, startConfirming] = useTransition();

  const config = DIRECTIONS.find((d) => d.value === direction)!;
  const sourceWallet = wallets.find((w) => w.currency === config.source);
  const secondsLeft = useCountdown(quoteState.quote?.expiresAt);
  const quoteExpired = quoteState.quote ? secondsLeft <= 0 : false;

  function handleGetQuote() {
    const fd = new FormData();
    fd.set("sourceCurrency", config.source);
    fd.set("targetCurrency", config.target);
    fd.set("amount", amount);

    startQuoting(async () => {
      const result = await getSwapQuote({}, fd);
      setQuoteState(result);
    });
  }

  function handleConfirm() {
    if (!quoteState.quote) return;
    const fd = new FormData();
    fd.set("quoteId", quoteState.quote.id);

    startConfirming(async () => {
      const result = await confirmSwap({}, fd);
      setConfirmState(result);
      if (result.transactionId && !result.error) {
        setDone(true);
      }
    });
  }

  function reset() {
    setDone(false);
    setQuoteState({});
    setConfirmState({});
    setAmount("");
  }

  if (done) {
    return (
      <Card className="p-6 sm:p-8">
        <SuccessScreen onReset={reset} />
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="mb-6 text-base font-semibold">Exchange USDT</h2>

      {!quoteState.quote ? (
        <div className="flex flex-col gap-6">
          <div>
            <p className="mb-2 text-sm font-medium text-foreground/80">Direction</p>
            <div className="flex flex-wrap gap-2">
              {DIRECTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => {
                    setDirection(d.value);
                    setAmount("");
                  }}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                    direction === d.value
                      ? "border-primary-400 bg-primary-50 text-primary-700 ring-1 ring-primary-400"
                      : "border-border bg-white text-foreground/70 hover:border-primary-300"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="amount" className="mb-1.5 block text-sm font-medium text-foreground/80">
              Amount ({config.source})
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-foreground/50">
                {CURRENCY_META[config.source].symbol}
              </span>
              <input
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-11 w-full rounded-xl border border-border bg-white pl-8 pr-3.5 text-base outline-none transition-colors focus:border-primary-400 sm:text-sm"
              />
            </div>
            {sourceWallet && (
              <p className="mt-1.5 text-xs text-foreground/50">
                Available: {formatBalance(config.source, sourceWallet.balance)}
              </p>
            )}
          </div>

          {quoteState.error && <p className="text-sm text-danger-500">{quoteState.error}</p>}

          <Button
            onClick={handleGetQuote}
            loading={isQuoting}
            disabled={!amount || Number(amount) <= 0}
            className="self-start"
          >
            Get quote
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            <div className="border-b border-border bg-primary-50 px-6 py-4">
              <p className="text-sm font-semibold text-primary-800">Quote summary</p>
            </div>
            <dl className="divide-y divide-border">
              {[
                { label: "You send", value: `${quoteState.quote.sourceAmount} ${quoteState.quote.sourceCurrency}` },
                { label: "You receive", value: `${quoteState.quote.targetAmount} ${quoteState.quote.targetCurrency}` },
                { label: "Rate", value: quoteState.quote.rateExplained },
                { label: "Fee", value: quoteState.quote.feeSummary },
                {
                  label: "Quote expires",
                  value: quoteExpired
                    ? "Expired"
                    : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`,
                },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-4 px-6 py-3.5">
                  <dt className="shrink-0 text-sm text-foreground/60">{label}</dt>
                  <dd className={`text-right text-sm font-medium ${quoteExpired && label === "Quote expires" ? "text-danger-500" : "text-foreground"}`}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {confirmState.error && <p className="text-sm text-danger-500">{confirmState.error}</p>}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setQuoteState({})} disabled={isConfirming}>
              Back
            </Button>
            {quoteExpired ? (
              <Button onClick={handleGetQuote} loading={isQuoting}>
                Get new quote
              </Button>
            ) : (
              <Button onClick={handleConfirm} loading={isConfirming}>
                {isConfirming ? "Exchanging…" : "Confirm & Exchange"}
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

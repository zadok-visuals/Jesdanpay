"use client";

import { useState, useTransition } from "react";
import type { AdminFxRate, Currency, Wallet } from "@/lib/types/database";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { convertToCny, type CnyConvertActionState } from "@/lib/actions/payments";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";

const SOURCE_CURRENCIES: Currency[] = ["NGN", "GHS", "KES", "USDT"];

function marginFor(currency: Currency) {
  return currency === "USDT" ? 0.01 : 0.02;
}

function SuccessScreen({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-3xl">
        ✅
      </div>
      <div>
        <p className="text-base font-semibold">Rate locked!</p>
        <p className="mt-1 text-sm text-foreground/60">
          Your CNY balance has been credited at the locked rate. You can spend it any time via
          "Send to China" — the actual transfer is still confirmed manually by our team.
        </p>
      </div>
      <Button variant="secondary" onClick={onReset}>
        Convert more
      </Button>
    </div>
  );
}

export function CnyConvertForm({ wallets, fxRates }: { wallets: Wallet[]; fxRates: AdminFxRate[] }) {
  const availableCurrencies = SOURCE_CURRENCIES.filter((c) => wallets.some((w) => w.currency === c));
  const [sourceCurrency, setSourceCurrency] = useState<Currency>(availableCurrencies[0] ?? "NGN");
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [actionState, setActionState] = useState<CnyConvertActionState>({});

  const sourceWallet = wallets.find((w) => w.currency === sourceCurrency);
  const rateRow = fxRates.find((r) => r.source_currency === sourceCurrency);
  const publishedRate = rateRow?.cny_rate ?? null;
  const margin = marginFor(sourceCurrency);
  const lockedRate = publishedRate != null ? publishedRate * (1 - margin) : null;

  const amountNum = parseFloat(amount) || 0;
  const amountValid = amountNum > 0 && amountNum <= (sourceWallet?.balance ?? 0);
  const rateAvailable = lockedRate != null;
  const lockedCnyAmount = lockedRate != null ? amountNum * lockedRate : 0;

  function reset() {
    setDone(false);
    setAmount("");
    setActionState({});
  }

  function handleSubmit() {
    const fd = new FormData();
    fd.set("sourceCurrency", sourceCurrency);
    fd.set("amount", amount);

    startTransition(async () => {
      const result = await convertToCny({}, fd);
      setActionState(result);
      if (result.conversionId && !result.error) {
        setDone(true);
      }
    });
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
      <div className="mb-6 flex flex-col gap-1">
        <h2 className="text-base font-semibold">Convert to CNY</h2>
        <p className="text-xs text-foreground/50">
          Lock in a CNY balance now at today's rate. Not a real CNY deposit — this reserves the
          converted amount for you to send later via "Send to China".
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <p className="mb-2 text-sm font-medium text-foreground/80">Convert from</p>
          <div className="flex flex-wrap gap-2">
            {availableCurrencies.map((c) => {
              const w = wallets.find((w) => w.currency === c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSourceCurrency(c)}
                  className={`flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors ${
                    sourceCurrency === c
                      ? "border-primary-400 bg-primary-50 ring-1 ring-primary-400"
                      : "border-border bg-white hover:border-primary-300"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <span>{CURRENCY_META[c].flag}</span>
                    <span>{c}</span>
                  </span>
                  <span className="text-xs text-foreground/50">
                    Balance: {w ? formatBalance(c, w.balance) : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="cnyAmount" className="mb-1.5 block text-sm font-medium text-foreground/80">
            Amount ({sourceCurrency})
          </label>
          <AmountInput
            id="cnyAmount"
            symbol={CURRENCY_META[sourceCurrency].symbol}
            value={amount}
            onChange={setAmount}
          />
          {sourceWallet && (
            <p className="mt-1.5 text-xs text-foreground/50">
              Available: {formatBalance(sourceCurrency, sourceWallet.balance)}
            </p>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="border-b border-border bg-primary-50 px-6 py-4">
            <p className="text-sm font-semibold text-primary-800">Locked-rate preview</p>
          </div>
          <dl className="divide-y divide-border">
            {[
              {
                label: "Locked rate",
                value: rateAvailable
                  ? `1 ${sourceCurrency} = ${lockedRate!.toLocaleString("en-US", { maximumFractionDigits: 6 })} CNY`
                  : "Not available right now",
              },
              { label: "Margin", value: `${(margin * 100).toFixed(0)}%` },
              {
                label: "You'll receive (CNY balance)",
                value: rateAvailable ? formatBalance("CNY", lockedCnyAmount) : "—",
              },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between gap-4 px-6 py-3.5">
                <dt className="shrink-0 text-sm text-foreground/60">{label}</dt>
                <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {actionState.error && <p className="text-sm text-danger-500">{actionState.error}</p>}

        <Button
          onClick={handleSubmit}
          loading={isPending}
          disabled={!amountValid || !rateAvailable}
          className="self-start"
        >
          {isPending ? "Locking rate…" : "Lock in CNY balance"}
        </Button>
      </div>
    </Card>
  );
}

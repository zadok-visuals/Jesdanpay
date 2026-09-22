"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Currency, Wallet } from "@/lib/types/database";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { marginFor, round2 } from "@/lib/cny/tiers";
import {
  previewCnyRate,
  submitCnyConversion,
  type CnyDirection,
  type CnyRateState,
  type CnyConvertActionState,
} from "@/lib/actions/payments";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";

const NON_CNY_CURRENCIES: Currency[] = ["NGN", "GHS", "KES", "USDT"];

function SuccessScreen({ direction, onReset }: { direction: CnyDirection; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-3xl">
        ✅
      </div>
      <div>
        <p className="text-base font-semibold">
          {direction === "to_cny" ? "Rate locked!" : "Converted!"}
        </p>
        <p className="mt-1 text-sm text-foreground/60">
          {direction === "to_cny"
            ? `Your CNY balance has been credited at the locked rate. You can spend it any time via "Send to China" — the actual transfer is still confirmed manually by our team.`
            : "Your balance has been updated at the locked rate."}
        </p>
      </div>
      <Button variant="secondary" onClick={onReset}>
        Convert more
      </Button>
    </div>
  );
}

export function CnyConvertForm({ wallets }: { wallets: Wallet[] }) {
  const availableCurrencies = NON_CNY_CURRENCIES.filter((c) => wallets.some((w) => w.currency === c));
  const cnyWallet = wallets.find((w) => w.currency === "CNY");

  const [direction, setDirection] = useState<CnyDirection>("to_cny");
  const [nonCnyCurrency, setNonCnyCurrency] = useState<Currency>(availableCurrencies[0] ?? "NGN");
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState(false);
  const [previewState, setPreviewState] = useState<CnyRateState>({});
  const [isPreviewing, startPreviewing] = useTransition();
  const [actionState, setActionState] = useState<CnyConvertActionState>({});
  const [isSubmitting, startSubmitting] = useTransition();
  const router = useRouter();

  // Any change to what's being converted invalidates the current preview — force a fresh "Get
  // rate" rather than let a stale quote sit next to a "Lock in" button.
  useEffect(() => {
    setPreviewState({});
  }, [direction, nonCnyCurrency, amount]);

  const amountNum = parseFloat(amount) || 0;
  const amountEntered = amountNum > 0;
  const spendWallet = direction === "to_cny" ? wallets.find((w) => w.currency === nonCnyCurrency) : cnyWallet;
  const spendCurrency: Currency = direction === "to_cny" ? nonCnyCurrency : "CNY";
  const exceedsBalance = amountEntered && !!spendWallet && amountNum > spendWallet.balance;
  const amountValid = amountEntered && !exceedsBalance;

  const preview = previewState.preview;
  const margin = marginFor(nonCnyCurrency);
  // When there's no fiat leg (nonCnyCurrency is USDT), the tier rate itself IS the reference
  // rate — show that exact configured number rather than re-deriving a ratio from already-
  // rounded preview amounts, which introduces tiny cosmetic rounding noise (e.g. 6.501951
  // instead of the actual configured 6.5).
  const effectiveRate =
    !preview
      ? null
      : preview.bushaRate == null
        ? preview.tierRate
        : preview.nonCnyAmount > 0
          ? preview.cnyAmount / preview.nonCnyAmount
          : null;
  const receiveAmount = preview
    ? direction === "to_cny"
      ? round2(preview.cnyAmount * (1 - margin))
      : round2(preview.nonCnyAmount * (1 - margin))
    : null;
  const receiveCurrency: Currency = direction === "to_cny" ? "CNY" : nonCnyCurrency;

  let previewButtonReason: string | null = null;
  if (!amountEntered) previewButtonReason = "Enter an amount to continue";
  else if (exceedsBalance) previewButtonReason = `Amount exceeds your available ${spendCurrency} balance`;

  let lockButtonReason: string | null = null;
  if (!amountValid) lockButtonReason = previewButtonReason;
  else if (!preview) lockButtonReason = "Get a rate first";

  function switchDirection(next: CnyDirection) {
    setDirection(next);
    setAmount("");
    setPreviewState({});
    setActionState({});
  }

  function handlePreview() {
    const fd = new FormData();
    fd.set("direction", direction);
    fd.set("nonCnyCurrency", nonCnyCurrency);
    fd.set("amount", amount);
    startPreviewing(async () => {
      const result = await previewCnyRate({}, fd);
      setPreviewState(result);
    });
  }

  function handleSubmit() {
    const fd = new FormData();
    fd.set("direction", direction);
    fd.set("nonCnyCurrency", nonCnyCurrency);
    fd.set("amount", amount);
    startSubmitting(async () => {
      const result = await submitCnyConversion({}, fd);
      setActionState(result);
      if (result.conversionId && !result.error) {
        setDone(true);
        // Wallet balances shown on this page (and its currency pickers) come from the server
        // component's initial fetch — refresh so the next conversion sees the real post-trade
        // balance instead of a stale pre-trade number.
        router.refresh();
      }
    });
  }

  function reset() {
    setDone(false);
    setAmount("");
    setPreviewState({});
    setActionState({});
  }

  if (done) {
    return (
      <Card className="p-6 sm:p-8">
        <SuccessScreen direction={direction} onReset={reset} />
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="mb-6 flex flex-col gap-1">
        <h2 className="text-base font-semibold">Convert CNY</h2>
        <p className="text-xs text-foreground/50">
          {direction === "to_cny"
            ? `Lock in a CNY balance now at today's rate. Not a real CNY deposit — this reserves the converted amount for you to send later via "Send to China".`
            : "Convert part of your locked CNY balance back to fiat or USDT at today's rate."}
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Direction toggle */}
        <div className="inline-flex items-center gap-1 self-start rounded-xl bg-black/[.04] p-1">
          {(["to_cny", "from_cny"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => switchDirection(d)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                direction === d ? "bg-white text-primary-700" : "text-foreground/60 hover:text-foreground"
              }`}
            >
              {d === "to_cny" ? "Convert to CNY" : "Convert from CNY"}
            </button>
          ))}
        </div>

        {/* Non-CNY currency picker */}
        <div>
          <p className="mb-2 text-sm font-medium text-foreground/80">
            {direction === "to_cny" ? "Convert from" : "Convert to"}
          </p>
          <div className="flex flex-wrap gap-2">
            {availableCurrencies.map((c) => {
              const w = wallets.find((w) => w.currency === c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNonCnyCurrency(c)}
                  className={`flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors ${
                    nonCnyCurrency === c
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

        {/* Amount */}
        <div>
          <label htmlFor="cnyAmount" className="mb-1.5 block text-sm font-medium text-foreground/80">
            Amount ({spendCurrency})
          </label>
          <AmountInput
            id="cnyAmount"
            symbol={CURRENCY_META[spendCurrency].symbol}
            value={amount}
            onChange={setAmount}
          />
          {exceedsBalance ? (
            <p className="mt-1.5 text-xs text-danger-500">
              Amount exceeds your available {spendCurrency} balance of{" "}
              {formatBalance(spendCurrency, spendWallet?.balance ?? 0)}
            </p>
          ) : (
            spendWallet && (
              <p className="mt-1.5 text-xs text-foreground/50">
                Available: {formatBalance(spendCurrency, spendWallet.balance)}
              </p>
            )
          )}
        </div>

        {previewState.error && <p className="text-sm text-danger-500">{previewState.error}</p>}

        {!preview ? (
          <div className="flex flex-col items-start gap-1.5">
            <Button
              onClick={handlePreview}
              loading={isPreviewing}
              disabled={!amountValid}
              title={previewButtonReason ?? undefined}
              className="self-start"
            >
              {isPreviewing ? "Fetching rate…" : "Get rate"}
            </Button>
            {previewButtonReason && (
              <p className={`text-xs ${exceedsBalance ? "text-danger-500" : "text-foreground/50"}`}>
                {previewButtonReason}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl border border-border bg-white">
              <div className="border-b border-border bg-primary-50 px-6 py-4">
                <p className="text-sm font-semibold text-primary-800">Rate preview</p>
              </div>
              <dl className="divide-y divide-border">
                {preview.bushaRate != null && (
                  <div className="flex items-start justify-between gap-4 px-6 py-3.5">
                    <dt className="shrink-0 text-sm text-foreground/60">Live rate</dt>
                    <dd className="text-right text-sm font-medium text-foreground">
                      {`1 ${nonCnyCurrency} = ${preview.bushaRate.toLocaleString("en-US", { maximumFractionDigits: 6 })} USDT`}
                    </dd>
                  </div>
                )}
                <div className="flex items-start justify-between gap-4 px-6 py-3.5">
                  <dt className="shrink-0 text-sm text-foreground/60">Reference rate (no margin)</dt>
                  <dd className="text-right text-sm font-medium text-foreground">
                    {effectiveRate != null
                      ? `1 ${nonCnyCurrency} = ${effectiveRate.toLocaleString("en-US", { maximumFractionDigits: 6 })} CNY`
                      : "—"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 px-6 py-3.5">
                  <dt className="shrink-0 text-sm text-foreground/60">Margin</dt>
                  <dd className="text-right text-sm font-medium text-foreground">
                    {(margin * 100).toFixed(0)}%
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4 px-6 py-3.5">
                  <dt className="shrink-0 text-sm text-foreground/60">You&rsquo;ll receive</dt>
                  <dd className="text-right text-sm font-medium text-foreground">
                    {receiveAmount != null ? formatBalance(receiveCurrency, receiveAmount) : "—"}
                  </dd>
                </div>
              </dl>
            </div>

            {actionState.error && <p className="text-sm text-danger-500">{actionState.error}</p>}

            <div className="flex flex-col items-start gap-1.5">
              <Button
                onClick={handleSubmit}
                loading={isSubmitting}
                disabled={!amountValid || !preview}
                title={lockButtonReason ?? undefined}
                className="self-start"
              >
                {isSubmitting
                  ? "Converting…"
                  : direction === "to_cny"
                    ? "Lock in CNY balance"
                    : `Convert to ${nonCnyCurrency}`}
              </Button>
              <button
                type="button"
                onClick={() => setPreviewState({})}
                className="text-xs font-medium text-foreground/50 hover:text-foreground"
              >
                Rate changed your mind? Get a fresh rate
              </button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

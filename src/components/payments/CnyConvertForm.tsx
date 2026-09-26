"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Currency, Wallet, CnyTierRate } from "@/lib/types/database";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { computeConversionAmounts, round2, type CnyDirection } from "@/lib/cny/tiers";
import {
  previewLiveBushaRate,
  submitCnyConversion,
  type CnyConvertActionState,
} from "@/lib/actions/payments";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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

export function CnyConvertForm({
  wallets,
  tierRates,
  fiatMarkupRate,
  usdtMarkupRate,
}: {
  wallets: Wallet[];
  tierRates: CnyTierRate[];
  fiatMarkupRate: number;
  usdtMarkupRate: number;
}) {
  const availableCurrencies = NON_CNY_CURRENCIES.filter((c) => wallets.some((w) => w.currency === c));
  const cnyWallet = wallets.find((w) => w.currency === "CNY");

  const [direction, setDirection] = useState<CnyDirection>("to_cny");
  const [nonCnyCurrency, setNonCnyCurrency] = useState<Currency>(availableCurrencies[0] ?? "NGN");
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState(false);
  const [actionState, setActionState] = useState<CnyConvertActionState>({});
  const [isSubmitting, startSubmitting] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const router = useRouter();

  // The live rate depends only on which non-CNY currency is selected, not on direction or
  // amount — fetched once per currency change (a discrete, infrequent event), never per
  // keystroke. Every keystroke after that is pure client math via computeConversionAmounts, so
  // "you'll receive" is genuinely instant with no network round-trip.
  const [bushaRate, setBushaRate] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [isRateLoading, startRateLoading] = useTransition();

  useEffect(() => {
    setRateError(null);
    if (nonCnyCurrency === "USDT") {
      setBushaRate(null);
      return;
    }
    setBushaRate(null);
    startRateLoading(async () => {
      const result = await previewLiveBushaRate(nonCnyCurrency);
      if (result.error) setRateError(result.error);
      else setBushaRate(result.rate ?? null);
    });
  }, [nonCnyCurrency]);

  const amountNum = parseFloat(amount) || 0;
  const amountEntered = amountNum > 0;
  const spendWallet = direction === "to_cny" ? wallets.find((w) => w.currency === nonCnyCurrency) : cnyWallet;
  const spendCurrency: Currency = direction === "to_cny" ? nonCnyCurrency : "CNY";
  const exceedsBalance = amountEntered && !!spendWallet && amountNum > spendWallet.balance;
  const amountValid = amountEntered && !exceedsBalance;
  const rateReady = nonCnyCurrency === "USDT" || bushaRate != null;
  const markupRate = nonCnyCurrency === "USDT" ? usdtMarkupRate : fiatMarkupRate;

  // Gated on rateReady alone (not amountValid) so the rate/fee preview keeps showing real numbers
  // even when the typed amount exceeds the user's balance — only the submit button below is
  // gated on amountValid, since that's the only thing insufficient balance should actually block.
  const amounts =
    amountEntered && rateReady
      ? computeConversionAmounts(direction, amountNum, bushaRate, tierRates)
      : null;

  const effectiveRate = amounts && amounts.nonCnyAmount > 0 ? amounts.cnyAmount / amounts.nonCnyAmount : null;
  const finalRate = effectiveRate != null ? effectiveRate * (1 - markupRate) : null;
  const receiveCurrency: Currency = direction === "to_cny" ? "CNY" : nonCnyCurrency;
  const receiveAmount = amounts
    ? round2((direction === "to_cny" ? amounts.cnyAmount : amounts.nonCnyAmount) * (1 - markupRate))
    : null;
  const feeAmount = amountEntered ? round2(amountNum * markupRate) : null;

  let disabledReason: string | null = null;
  if (!amountEntered) disabledReason = "Enter an amount to continue";
  else if (exceedsBalance) disabledReason = `Amount exceeds your available ${spendCurrency} balance`;
  else if (isRateLoading) disabledReason = "Fetching live rate…";
  else if (rateError) disabledReason = "Rate unavailable — try again";
  else if (!amounts) disabledReason = "Conversion rates aren't configured yet";

  function switchDirection(next: CnyDirection) {
    setDirection(next);
    setAmount("");
    setActionState({});
  }

  function handleSubmit() {
    setConfirmOpen(false);
    const fd = new FormData();
    fd.set("direction", direction);
    fd.set("nonCnyCurrency", nonCnyCurrency);
    fd.set("amount", amount);
    startSubmitting(async () => {
      const result = await submitCnyConversion({}, fd);
      setActionState(result);
      if (result.conversionId && !result.error) {
        setDone(true);
        toast.success("Conversion complete");
        // Wallet balances shown on this page (and its currency pickers) come from the server
        // component's initial fetch — refresh so the next conversion sees the real post-trade
        // balance instead of a stale pre-trade number.
        router.refresh();
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  }

  function reset() {
    setDone(false);
    setAmount("");
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

        {/* You will receive — directly after Amount, live on every keystroke */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground/80">
            You will receive
          </label>
          <div className="flex h-14 items-center rounded-xl border border-border bg-black/[.02] px-3.5">
            <span className="text-xl font-bold tracking-tight">
              {!amountEntered
                ? "—"
                : isRateLoading
                  ? "Fetching live rate…"
                  : receiveAmount != null
                    ? formatBalance(receiveCurrency, receiveAmount)
                    : "—"}
            </span>
          </div>
        </div>

        {rateError && <p className="text-sm text-danger-500">{rateError}</p>}

        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="border-b border-border bg-primary-50 px-6 py-4">
            <p className="text-sm font-semibold text-primary-800">Rate details</p>
          </div>
          <dl className="divide-y divide-border">
            <div className="flex items-start justify-between gap-4 px-6 py-3.5">
              <dt className="shrink-0 text-sm text-foreground/60">Reference price (before fee)</dt>
              <dd className="text-right text-sm font-medium text-foreground">
                {effectiveRate != null
                  ? nonCnyCurrency === "USDT"
                    ? `USDT 1 = CNY ${effectiveRate.toLocaleString("en-US", { maximumFractionDigits: 6 })}`
                    : `CNY 1 = ${(1 / effectiveRate).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${nonCnyCurrency}`
                  : "—"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 px-6 py-3.5">
              <dt className="shrink-0 text-sm text-foreground/60">Price after fee</dt>
              <dd className="text-right text-sm font-medium text-foreground">
                {finalRate != null
                  ? nonCnyCurrency === "USDT"
                    ? `USDT 1 = CNY ${finalRate.toLocaleString("en-US", { maximumFractionDigits: 6 })}`
                    : `CNY 1 = ${(1 / finalRate).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${nonCnyCurrency}`
                  : "—"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 px-6 py-3.5">
              <dt className="shrink-0 text-sm text-foreground/60">Conversion fee</dt>
              <dd className="text-right text-sm font-medium text-foreground">
                {feeAmount != null ? formatBalance(spendCurrency, feeAmount) : "—"}
              </dd>
            </div>
          </dl>
        </div>

        {actionState.error && <p className="text-sm text-danger-500">{actionState.error}</p>}

        <div className="flex flex-col items-start gap-1.5">
          <Button
            onClick={() => setConfirmOpen(true)}
            loading={isSubmitting}
            disabled={!amountValid || !amounts}
            title={disabledReason ?? undefined}
            className="self-start"
          >
            {isSubmitting
              ? "Converting…"
              : direction === "to_cny"
                ? "Lock in CNY balance"
                : `Convert to ${nonCnyCurrency}`}
          </Button>
          {disabledReason && (
            <p className={`text-xs ${exceedsBalance ? "text-danger-500" : "text-foreground/50"}`}>
              {disabledReason}
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm conversion"
        message={
          receiveAmount != null
            ? `Confirm conversion of ${formatBalance(spendCurrency, amountNum)} to ${formatBalance(receiveCurrency, receiveAmount)}?`
            : `Confirm conversion of ${formatBalance(spendCurrency, amountNum)}?`
        }
        confirmLabel="Confirm conversion"
        loading={isSubmitting}
        onConfirm={handleSubmit}
        onCancel={() => setConfirmOpen(false)}
      />
    </Card>
  );
}

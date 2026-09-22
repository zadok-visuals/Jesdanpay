"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Wallet } from "@/lib/types/database";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { executeSwap, type ExecuteSwapState } from "@/lib/actions/busha";
import { previewLiveBushaRate } from "@/lib/actions/payments";
import { applyMarkup } from "@/lib/busha/markup";
import type { Currency } from "@/lib/types/database";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";

type Direction =
  | "USDT_TO_NGN"
  | "NGN_TO_USDT"
  | "USDT_TO_GHS"
  | "GHS_TO_USDT"
  | "USDT_TO_KES"
  | "KES_TO_USDT";

const DIRECTIONS: { value: Direction; source: Currency; target: Currency; label: string }[] = [
  { value: "NGN_TO_USDT", source: "NGN", target: "USDT", label: "NGN → USDT" },
  { value: "USDT_TO_NGN", source: "USDT", target: "NGN", label: "USDT → NGN" },
  { value: "GHS_TO_USDT", source: "GHS", target: "USDT", label: "GHS → USDT" },
  { value: "USDT_TO_GHS", source: "USDT", target: "GHS", label: "USDT → GHS" },
  { value: "KES_TO_USDT", source: "KES", target: "USDT", label: "KES → USDT" },
  { value: "USDT_TO_KES", source: "USDT", target: "KES", label: "USDT → KES" },
];

function SuccessScreen({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-3xl">✅</div>
      <div>
        <p className="text-base font-semibold">Exchange submitted!</p>
        <p className="mt-1 text-sm text-foreground/60">
          Your funds will appear once the exchange is confirmed — usually within minutes. Track its
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
  // Only offer a direction if the user actually holds both sides of it — e.g. a Nigerian user
  // only ever sees NGN <-> USDT, never GHS/KES, since wallet-row existence is the same
  // country-eligibility signal the wallet-provisioning trigger already uses (see
  // RmbExchangeForm/CnyConvertForm's identical `wallets.some(...)` filtering pattern).
  const availableDirections = DIRECTIONS.filter(
    (d) => wallets.some((w) => w.currency === d.source) && wallets.some((w) => w.currency === d.target),
  );
  const [direction, setDirection] = useState<Direction | null>(availableDirections[0]?.value ?? null);
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState(false);
  const [actionState, setActionState] = useState<ExecuteSwapState>({});
  const [isExecuting, startExecuting] = useTransition();
  const router = useRouter();

  // The live fiat/USDT rate depends only on which fiat currency is involved, not on the swap
  // direction or the amount — fetched once per fiat-currency change via the same safe probe
  // Convert CNY uses (see probeFiatToUsdtRate's header comment). Every keystroke after that is
  // pure client math, so "you'll receive" is instant with no per-keystroke network call.
  const config = direction ? DIRECTIONS.find((d) => d.value === direction)! : null;
  const fiatCurrency = config ? (config.source === "USDT" ? config.target : config.source) : null;
  const [usdtPerFiat, setUsdtPerFiat] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [isRateLoading, startRateLoading] = useTransition();

  useEffect(() => {
    setRateError(null);
    setUsdtPerFiat(null);
    if (!fiatCurrency) return;
    startRateLoading(async () => {
      const result = await previewLiveBushaRate(fiatCurrency);
      if (result.error) setRateError(result.error);
      else setUsdtPerFiat(result.rate ?? null);
    });
    // Depending on the derived fiat currency (not `direction` itself) avoids an unnecessary
    // refetch when switching between the two directions of the same pair (e.g. NGN_TO_USDT <->
    // USDT_TO_NGN both involve NGN).
  }, [fiatCurrency]);

  if (!direction || !config) {
    return (
      <Card className="p-6 sm:p-8">
        <h2 className="mb-2 text-base font-semibold">Convert USDT</h2>
        <p className="text-sm text-foreground/60">
          USDT exchange isn&rsquo;t available without a local currency wallet.
        </p>
      </Card>
    );
  }

  const sourceWallet = wallets.find((w) => w.currency === config.source);
  const amountNum = Number(amount) || 0;
  const exceedsBalance = amountNum > 0 && !!sourceWallet && amountNum > sourceWallet.balance;
  const amountValid = amountNum > 0 && !exceedsBalance;
  const fiatPerUsdt = usdtPerFiat != null ? 1 / usdtPerFiat : null;

  // "You will receive": fiat -> USDT multiplies by usdtPerFiat; USDT -> fiat multiplies by
  // fiatPerUsdt (the inverse) — then the same 0.5% customer-facing markup applied to every
  // automated swap (src/lib/busha/markup.ts), computed client-side purely for display; the real
  // amount is always independently recomputed server-side from Busha's own transfer response.
  const rawTargetAmount =
    amountValid && usdtPerFiat != null && fiatPerUsdt != null
      ? config.source === "USDT"
        ? amountNum * fiatPerUsdt
        : amountNum * usdtPerFiat
      : null;
  const receiveAmount = rawTargetAmount != null ? applyMarkup(rawTargetAmount) : null;

  let disabledReason: string | null = null;
  if (amountNum <= 0) disabledReason = "Enter an amount to continue";
  else if (exceedsBalance) disabledReason = `Amount exceeds your available ${config.source} balance`;
  else if (isRateLoading) disabledReason = "Fetching live rate…";
  else if (rateError) disabledReason = "Rate unavailable — try again";

  function handleExecute() {
    const fd = new FormData();
    fd.set("sourceCurrency", config!.source);
    fd.set("targetCurrency", config!.target);
    fd.set("amount", amount);

    startExecuting(async () => {
      const result = await executeSwap({}, fd);
      setActionState(result);
      if (result.transactionId && !result.error) {
        setDone(true);
        // Wallet balances shown on this page (and its currency pickers) come from the server
        // component's initial fetch — refresh so the next exchange sees the real post-trade
        // balance instead of a stale pre-trade number.
        router.refresh();
      }
    });
  }

  function reset() {
    setDone(false);
    setActionState({});
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
      <h2 className="mb-6 text-base font-semibold">Convert USDT</h2>

      <div className="flex flex-col gap-6">
        <div>
          <p className="mb-2 text-sm font-medium text-foreground/80">Direction</p>
          <div className="flex flex-wrap gap-2">
            {availableDirections.map((d) => (
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
          <AmountInput
            id="amount"
            symbol={CURRENCY_META[config.source].symbol}
            value={amount}
            onChange={setAmount}
          />
          {exceedsBalance ? (
            <p className="mt-1.5 text-xs text-danger-500">
              Amount exceeds your available {config.source} balance of{" "}
              {formatBalance(config.source, sourceWallet?.balance ?? 0)}
            </p>
          ) : (
            sourceWallet && (
              <p className="mt-1.5 text-xs text-foreground/50">
                Available: {formatBalance(config.source, sourceWallet.balance)}
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
              {amountNum <= 0
                ? "—"
                : isRateLoading
                  ? "Fetching live rate…"
                  : receiveAmount != null
                    ? formatBalance(config.target, receiveAmount)
                    : "—"}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-foreground/50">
            {isRateLoading
              ? "Fetching live rate…"
              : fiatPerUsdt != null
                ? `USDT 1 = ${fiatCurrency} ${fiatPerUsdt.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                : rateError
                  ? rateError
                  : "—"}
          </p>
        </div>

        {actionState.error && <p className="text-sm text-danger-500">{actionState.error}</p>}

        <div className="flex flex-col items-start gap-1.5">
          <Button
            onClick={handleExecute}
            loading={isExecuting}
            disabled={!amountValid || isRateLoading || !!rateError}
            title={disabledReason ?? undefined}
            className="self-start"
          >
            {isExecuting ? "Exchanging…" : "Confirm & Exchange"}
          </Button>
          {disabledReason && (
            <p className={`text-xs ${exceedsBalance ? "text-danger-500" : "text-foreground/50"}`}>
              {disabledReason}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

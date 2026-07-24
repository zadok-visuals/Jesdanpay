"use client";

import { useState, useActionState, useTransition } from "react";
import type { Wallet, Currency, PayoutMethod } from "@/lib/types/database";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { saveRmbRecipient, type PaymentsActionState } from "@/lib/actions/payments";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

// ─── types ────────────────────────────────────────────────────────────────────

type Step = "source" | "recipient" | "confirm";

interface SendState {
  sourceCurrency: Currency;
  amount: string;
  payoutMethod: PayoutMethod;
  // Alipay
  recipientAlipayId: string;
  // WeChat
  recipientWechatId: string;
  // Bank
  recipientBankAccountNumber: string;
  recipientBankName: string;
  recipientAccountHolderName: string;
}

const DEFAULT_STATE: SendState = {
  sourceCurrency: "NGN",
  amount: "",
  payoutMethod: "alipay",
  recipientAlipayId: "",
  recipientWechatId: "",
  recipientBankAccountNumber: "",
  recipientBankName: "",
  recipientAccountHolderName: "",
};

const PAYOUT_METHODS: { value: PayoutMethod; label: string; icon: string }[] = [
  { value: "alipay", label: "Alipay", icon: "🔵" },
  { value: "wechat", label: "WeChat Pay", icon: "🟢" },
  { value: "bank", label: "Bank Account", icon: "🏦" },
];

const SEND_CURRENCIES: Currency[] = ["NGN", "CNY"];

// ─── helpers ──────────────────────────────────────────────────────────────────

function StepDots({ current }: { current: Step }) {
  const steps: Step[] = ["source", "recipient", "confirm"];
  return (
    <div className="flex items-center gap-2" aria-label="Progress steps">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              s === current
                ? "bg-primary-500 text-white"
                : steps.indexOf(current) > i
                  ? "bg-primary-100 text-primary-700"
                  : "bg-black/[.06] text-foreground/40"
            }`}
          >
            {i + 1}
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-px w-8 transition-colors ${
                steps.indexOf(current) > i ? "bg-primary-300" : "bg-black/[.08]"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function StepLabel({ step }: { step: Step }) {
  const labels: Record<Step, string> = {
    source: "Amount & source",
    recipient: "Recipient details",
    confirm: "Review & confirm",
  };
  return (
    <p className="mt-2 text-xs font-medium text-foreground/50 uppercase tracking-wide">
      {labels[step]}
    </p>
  );
}

// ─── Step 1 — Source & amount ─────────────────────────────────────────────────

function SourceStep({
  wallets,
  state,
  onChange,
  onNext,
}: {
  wallets: Wallet[];
  state: SendState;
  onChange: (patch: Partial<SendState>) => void;
  onNext: () => void;
}) {
  const availableCurrencies = SEND_CURRENCIES.filter((c) =>
    wallets.some((w) => w.currency === c),
  );
  const sourceWallet = wallets.find((w) => w.currency === state.sourceCurrency);
  const isCnySource = state.sourceCurrency === "CNY";
  const amountNum = parseFloat(state.amount) || 0;
  const amountValid = amountNum > 0 && amountNum <= (sourceWallet?.balance ?? 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Currency selector */}
      <div>
        <p className="mb-2 text-sm font-medium text-foreground/80">Send from</p>
        <div className="flex flex-wrap gap-2">
          {availableCurrencies.map((c) => {
            const w = wallets.find((w) => w.currency === c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => onChange({ sourceCurrency: c })}
                className={`flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors ${
                  state.sourceCurrency === c
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
        <label htmlFor="amount" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Amount ({state.sourceCurrency})
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-foreground/50">
            {CURRENCY_META[state.sourceCurrency].symbol}
          </span>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            max={sourceWallet?.balance ?? undefined}
            value={state.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
            placeholder="0.00"
            className="h-11 w-full rounded-xl border border-border bg-white pl-8 pr-3.5 text-sm outline-none transition-colors focus:border-primary-400"
          />
        </div>
        {sourceWallet && (
          <p className="mt-1.5 text-xs text-foreground/50">
            Available: {formatBalance(state.sourceCurrency, sourceWallet.balance)}
          </p>
        )}
      </div>

      {/* CNY direct-send info banner */}
      {isCnySource && (
        <div className="flex gap-3 rounded-xl border border-primary-200 bg-primary-50 p-4">
          <span className="mt-0.5 shrink-0 text-primary-500">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" strokeLinecap="round" />
              <path d="M12 16h.01" strokeLinecap="round" />
            </svg>
          </span>
          <p className="text-xs leading-relaxed text-primary-800">
            You&rsquo;re sending from your CNY balance. The rate was locked in at the time you
            converted — no further conversion happens at send time.
          </p>
        </div>
      )}

      {/* Rate info for non-CNY sources */}
      {!isCnySource && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-white px-4 py-3">
          <span className="text-lg">⇄</span>
          <div>
            <p className="text-xs font-medium text-foreground/70">
              {state.sourceCurrency} → CNY exchange rate
            </p>
            <p className="text-xs text-foreground/40">
              Live rate will be fetched via Klasha at confirmation (Milestone 2)
            </p>
          </div>
        </div>
      )}

      <Button
        disabled={!amountValid}
        onClick={onNext}
        className="self-start"
      >
        Next — Recipient details
      </Button>
    </div>
  );
}

// ─── Step 2 — Recipient details ───────────────────────────────────────────────

function RecipientStep({
  state,
  onChange,
  onBack,
  onNext,
}: {
  state: SendState;
  onChange: (patch: Partial<SendState>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  // Validation per method
  const isValid =
    state.payoutMethod === "alipay"
      ? state.recipientAlipayId.trim().length > 0
      : state.payoutMethod === "wechat"
        ? state.recipientWechatId.trim().length > 0
        : state.recipientBankAccountNumber.trim().length > 0 &&
          state.recipientBankName.trim().length > 0 &&
          state.recipientAccountHolderName.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Payout method selector */}
      <div>
        <p className="mb-2 text-sm font-medium text-foreground/80">Payout method</p>
        <div className="flex flex-wrap gap-2">
          {PAYOUT_METHODS.map(({ value, label, icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ payoutMethod: value })}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                state.payoutMethod === value
                  ? "border-primary-400 bg-primary-50 text-primary-700 ring-1 ring-primary-400"
                  : "border-border bg-white text-foreground/70 hover:border-primary-300"
              }`}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-foreground/40">
          Recipient always receives in <strong className="font-semibold text-foreground/60">CNY</strong> regardless of payout method.
        </p>
      </div>

      {/* Per-method fields */}
      {state.payoutMethod === "alipay" && (
        <Input
          label="Recipient Alipay ID"
          id="recipientAlipayId"
          name="recipientAlipayId"
          type="text"
          placeholder="Phone number or Alipay handle"
          value={state.recipientAlipayId}
          onChange={(e) => onChange({ recipientAlipayId: e.target.value })}
        />
      )}

      {state.payoutMethod === "wechat" && (
        <Input
          label="Recipient WeChat Pay ID"
          id="recipientWechatId"
          name="recipientWechatId"
          type="text"
          placeholder="WeChat ID"
          value={state.recipientWechatId}
          onChange={(e) => onChange({ recipientWechatId: e.target.value })}
        />
      )}

      {state.payoutMethod === "bank" && (
        <div className="flex flex-col gap-4">
          <Input
            label="Recipient bank account number"
            id="recipientBankAccountNumber"
            name="recipientBankAccountNumber"
            type="text"
            placeholder="Account number"
            value={state.recipientBankAccountNumber}
            onChange={(e) => onChange({ recipientBankAccountNumber: e.target.value })}
          />
          <Input
            label="Recipient bank name"
            id="recipientBankName"
            name="recipientBankName"
            type="text"
            placeholder="e.g. Industrial and Commercial Bank of China"
            value={state.recipientBankName}
            onChange={(e) => onChange({ recipientBankName: e.target.value })}
          />
          <Input
            label="Recipient account holder name"
            id="recipientAccountHolderName"
            name="recipientAccountHolderName"
            type="text"
            placeholder="Full name as on the account"
            value={state.recipientAccountHolderName}
            onChange={(e) => onChange({ recipientAccountHolderName: e.target.value })}
          />
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button disabled={!isValid} onClick={onNext}>
          Next — Review
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3 — Confirmation ────────────────────────────────────────────────────

function ConfirmStep({
  state,
  wallets,
  onBack,
  onSubmit,
  actionState,
  pending,
}: {
  state: SendState;
  wallets: Wallet[];
  onBack: () => void;
  onSubmit: () => void;
  actionState: PaymentsActionState;
  pending: boolean;
}) {
  const isCnySource = state.sourceCurrency === "CNY";
  const sourceWallet = wallets.find((w) => w.currency === state.sourceCurrency);
  const amountNum = parseFloat(state.amount) || 0;
  const methodLabel = PAYOUT_METHODS.find((m) => m.value === state.payoutMethod)?.label ?? "";

  const recipientSummary =
    state.payoutMethod === "alipay"
      ? state.recipientAlipayId
      : state.payoutMethod === "wechat"
        ? state.recipientWechatId
        : `${state.recipientBankName} · ${state.recipientBankAccountNumber}`;

  const rows: { label: string; value: string }[] = [
    {
      label: "You send",
      value: `${CURRENCY_META[state.sourceCurrency].symbol}${amountNum.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${state.sourceCurrency}`,
    },
    ...(!isCnySource
      ? [
          {
            label: "Exchange rate",
            value: "Fetched at send time (Milestone 2)",
          },
          { label: "Fee", value: "To be confirmed (Milestone 2)" },
        ]
      : [{ label: "Exchange rate", value: "Rate locked at conversion" }]),
    {
      label: "Recipient receives",
      value: isCnySource
        ? `¥${amountNum.toLocaleString("en-US", { minimumFractionDigits: 2 })} CNY`
        : "Calculated at send time",
    },
    { label: "Payout method", value: methodLabel },
    { label: "Recipient", value: recipientSummary },
    ...(state.payoutMethod === "bank"
      ? [{ label: "Account holder", value: state.recipientAccountHolderName }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Summary card */}
      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="border-b border-border bg-primary-50 px-6 py-4">
          <p className="text-sm font-semibold text-primary-800">Transfer summary</p>
        </div>
        <dl className="divide-y divide-border">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-start justify-between gap-4 px-6 py-3.5">
              <dt className="shrink-0 text-sm text-foreground/60">{label}</dt>
              <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* M2 info banner */}
      <div className="flex gap-3 rounded-xl border border-accent-200 bg-accent-50 p-4">
        <span className="mt-0.5 shrink-0 text-accent-600">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" strokeLinecap="round" />
            <path d="M12 16h.01" strokeLinecap="round" />
          </svg>
        </span>
        <p className="text-xs leading-relaxed text-accent-900">
          Your recipient details will be saved now. The actual transfer will execute once the Klasha
          exchange integration is live (Milestone 2).
        </p>
      </div>

      {actionState.error && (
        <p className="text-sm text-danger-500">{actionState.error}</p>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button
          onClick={onSubmit}
          loading={pending}
          title="Exchange provider not yet connected — Milestone 2"
          className="relative"
        >
          {pending ? "Saving…" : "Confirm & Save Recipient"}
        </Button>
      </div>
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-3xl">
        ✅
      </div>
      <div>
        <p className="text-base font-semibold">Recipient saved!</p>
        <p className="mt-1 text-sm text-foreground/60">
          Your recipient details are stored. When Milestone 2 launches, your transfer will execute
          automatically at the locked-in rate.
        </p>
      </div>
      <Button variant="secondary" onClick={onReset}>
        New transfer
      </Button>
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export function RmbExchangeForm({ wallets }: { wallets: Wallet[] }) {
  const [step, setStep] = useState<Step>("source");
  const [formState, setFormState] = useState<SendState>(DEFAULT_STATE);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [actionState, formAction] = useActionState<PaymentsActionState, FormData>(
    saveRmbRecipient,
    {},
  );

  function patch(p: Partial<SendState>) {
    setFormState((s) => ({ ...s, ...p }));
  }

  function handleSubmit() {
    const fd = new FormData();
    fd.set("payoutMethod", formState.payoutMethod);
    fd.set("recipientAlipayId", formState.recipientAlipayId);
    fd.set("recipientWechatId", formState.recipientWechatId);
    fd.set("recipientBankAccountNumber", formState.recipientBankAccountNumber);
    fd.set("recipientBankName", formState.recipientBankName);
    fd.set("recipientAccountHolderName", formState.recipientAccountHolderName);

    startTransition(async () => {
      const result = await saveRmbRecipient({}, fd);
      if (result.recipientId && !result.error) {
        setDone(true);
      }
    });
  }

  if (done) {
    return (
      <Card className="p-6 sm:p-8">
        <SuccessScreen
          onReset={() => {
            setDone(false);
            setStep("source");
            setFormState(DEFAULT_STATE);
          }}
        />
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-1">
        <div className="flex items-center gap-4">
          <h2 className="text-base font-semibold">Send to China</h2>
          <StepDots current={step} />
        </div>
        <StepLabel step={step} />
      </div>

      {step === "source" && (
        <SourceStep
          wallets={wallets}
          state={formState}
          onChange={patch}
          onNext={() => setStep("recipient")}
        />
      )}

      {step === "recipient" && (
        <RecipientStep
          state={formState}
          onChange={patch}
          onBack={() => setStep("source")}
          onNext={() => setStep("confirm")}
        />
      )}

      {step === "confirm" && (
        <ConfirmStep
          state={formState}
          wallets={wallets}
          onBack={() => setStep("recipient")}
          onSubmit={handleSubmit}
          actionState={actionState}
          pending={isPending}
        />
      )}
    </Card>
  );
}

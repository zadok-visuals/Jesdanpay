"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  Wallet,
  Currency,
  PayoutMethod,
  SavedRmbRecipient,
  CnyTierRate,
} from "@/lib/types/database";
import { CURRENCY_META, formatBalance } from "@/lib/currency";
import { submitRmbExchange, previewLiveBushaRate, type PaymentsActionState } from "@/lib/actions/payments";
import { computeConversionAmounts, round2 } from "@/lib/cny/tiers";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AmountInput } from "@/components/ui/AmountInput";
import { FileDropzone } from "@/components/ui/FileDropzone";

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
  // Recipient full name — required for Alipay/WeChat, regardless of manual vs. QR code entry
  recipientFirstName: string;
  recipientLastName: string;
  // Bank
  recipientBankAccountNumber: string;
  recipientBankName: string;
  recipientAccountHolderName: string;
  // QR code, as an alternative to typing the Alipay/WeChat ID
  useQrCode: boolean;
  qrCodeFile: File | null;
  qrCodeFileName: string;
  // Save for next time
  saveRecipient: boolean;
  saveLabel: string;
}

const DEFAULT_STATE: SendState = {
  sourceCurrency: "NGN",
  amount: "",
  payoutMethod: "alipay",
  recipientAlipayId: "",
  recipientWechatId: "",
  recipientFirstName: "",
  recipientLastName: "",
  recipientBankAccountNumber: "",
  recipientBankName: "",
  recipientAccountHolderName: "",
  useQrCode: false,
  qrCodeFile: null,
  qrCodeFileName: "",
  saveRecipient: false,
  saveLabel: "",
};

const PAYOUT_METHODS: { value: PayoutMethod; label: string; icon: string }[] = [
  { value: "alipay", label: "Alipay", icon: "🔵" },
  { value: "wechat", label: "WeChat Pay", icon: "🟢" },
  { value: "bank", label: "Bank Account", icon: "🏦" },
];

// CNY is included as a source since the rate-lock conversion feature (Convert CNY tab) now
// gives it a real path to a nonzero balance — sending from it debits the locked balance same as
// any other wallet.
const SEND_CURRENCIES: Currency[] = ["NGN", "GHS", "KES", "USDT", "CNY"];

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
  tierRates,
  markupRate,
}: {
  wallets: Wallet[];
  state: SendState;
  onChange: (patch: Partial<SendState>) => void;
  onNext: () => void;
  tierRates: CnyTierRate[];
  markupRate: number;
}) {
  const availableCurrencies = SEND_CURRENCIES.filter((c) =>
    wallets.some((w) => w.currency === c),
  );
  const sourceWallet = wallets.find((w) => w.currency === state.sourceCurrency);
  const amountNum = parseFloat(state.amount) || 0;
  const exceedsBalance = amountNum > 0 && !!sourceWallet && amountNum > sourceWallet.balance;
  const amountValid = amountNum > 0 && !exceedsBalance;
  const nextDisabledReason =
    amountNum <= 0
      ? "Enter an amount to continue"
      : exceedsBalance
        ? `Amount exceeds your available ${state.sourceCurrency} balance`
        : null;

  // No conversion at all when sending an already-locked CNY balance directly — the live rate
  // card below only applies when there's actually a fiat/USDT -> CNY leg to price.
  const isCnySource = state.sourceCurrency === "CNY";

  // Same live-rate pattern as Convert CNY/Convert USDT: fetched once per source-currency change
  // (never per keystroke), then computeConversionAmounts does the rest instantly, client-side.
  const [bushaRate, setBushaRate] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [isRateLoading, startRateLoading] = useTransition();

  useEffect(() => {
    setRateError(null);
    setBushaRate(null);
    if (isCnySource || state.sourceCurrency === "USDT") return;
    startRateLoading(async () => {
      const result = await previewLiveBushaRate(state.sourceCurrency);
      if (result.error) setRateError(result.error);
      else setBushaRate(result.rate ?? null);
    });
  }, [state.sourceCurrency, isCnySource]);

  const rateReady = isCnySource || state.sourceCurrency === "USDT" || bushaRate != null;
  const amounts =
    !isCnySource && amountValid && rateReady
      ? computeConversionAmounts("to_cny", amountNum, state.sourceCurrency === "USDT" ? null : bushaRate, tierRates)
      : null;
  const effectiveRate = amounts && amounts.nonCnyAmount > 0 ? amounts.cnyAmount / amounts.nonCnyAmount : null;
  const estimatedCny = amounts ? round2(amounts.cnyAmount * (1 - markupRate)) : null;

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
        <AmountInput
          id="amount"
          symbol={CURRENCY_META[state.sourceCurrency].symbol}
          value={state.amount}
          onChange={(v) => onChange({ amount: v })}
        />
        {exceedsBalance ? (
          <p className="mt-1.5 text-xs text-danger-500">
            Amount exceeds your available {state.sourceCurrency} balance of{" "}
            {formatBalance(state.sourceCurrency, sourceWallet?.balance ?? 0)}
          </p>
        ) : (
          sourceWallet && (
            <p className="mt-1.5 text-xs text-foreground/50">
              Available: {formatBalance(state.sourceCurrency, sourceWallet.balance)}
            </p>
          )
        )}
      </div>

      {isCnySource ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-white px-4 py-3">
          <span className="text-lg">⇄</span>
          <p className="text-xs font-medium text-foreground/70">
            No conversion — you&rsquo;re sending your CNY balance directly.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="border-b border-border bg-primary-50 px-6 py-4">
            <p className="text-sm font-semibold text-primary-800">Live rate</p>
          </div>
          <dl className="divide-y divide-border">
            <div className="flex items-start justify-between gap-4 px-6 py-3.5">
              <dt className="shrink-0 text-sm text-foreground/60">USDT/CNY anchor rate</dt>
              <dd className="text-right text-sm font-medium text-foreground">
                {amounts
                  ? `CNY 1 = ${(1 / amounts.tierRate).toLocaleString("en-US", { maximumFractionDigits: 6 })} USDT`
                  : "—"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 px-6 py-3.5">
              <dt className="shrink-0 text-sm text-foreground/60">
                CNY → {state.sourceCurrency} (est.)
              </dt>
              <dd className="text-right text-sm font-medium text-foreground">
                {effectiveRate != null
                  ? `CNY 1 = ${(1 / effectiveRate).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${state.sourceCurrency}`
                  : "—"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 px-6 py-3.5">
              <dt className="shrink-0 text-sm text-foreground/60">You&rsquo;ll receive (est.)</dt>
              <dd className="text-right text-sm font-medium text-foreground">
                {!amountValid
                  ? "—"
                  : isRateLoading
                    ? "Fetching live rate…"
                    : estimatedCny != null
                      ? formatBalance("CNY", estimatedCny)
                      : "—"}
              </dd>
            </div>
          </dl>
          {rateError && <p className="px-6 py-2 text-xs text-danger-500">{rateError}</p>}
          <p className="border-t border-border px-6 py-2 text-xs text-foreground/40">
            An estimate — the actual transfer is confirmed manually by our team, usually within
            1–2 hours.
          </p>
        </div>
      )}

      <div className="flex flex-col items-start gap-1.5">
        <Button
          disabled={!amountValid}
          onClick={onNext}
          title={nextDisabledReason ?? undefined}
          className="self-start"
        >
          Next — Recipient details
        </Button>
        {nextDisabledReason && (
          <p className={`text-xs ${exceedsBalance ? "text-danger-500" : "text-foreground/50"}`}>
            {nextDisabledReason}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Step 2 — Recipient details ───────────────────────────────────────────────

function RecipientStep({
  state,
  onChange,
  onBack,
  onNext,
  savedRecipients,
}: {
  state: SendState;
  onChange: (patch: Partial<SendState>) => void;
  onBack: () => void;
  onNext: () => void;
  savedRecipients: SavedRmbRecipient[];
}) {
  // Validation per method. For Alipay/WeChat, the contact detail (text or QR) and the two name
  // fields are independent requirements — a QR upload satisfies the contact detail but never
  // waives the name fields.
  const isAlipayOrWechat = state.payoutMethod === "alipay" || state.payoutMethod === "wechat";
  const contactValid = isAlipayOrWechat
    ? state.useQrCode
      ? state.qrCodeFile !== null
      : state.payoutMethod === "alipay"
        ? state.recipientAlipayId.trim().length > 0
        : state.recipientWechatId.trim().length > 0
    : true;
  const namesValid = isAlipayOrWechat
    ? state.recipientFirstName.trim().length > 0 && state.recipientLastName.trim().length > 0
    : true;
  const recipientValid = isAlipayOrWechat
    ? contactValid && namesValid
    : state.recipientBankAccountNumber.trim().length > 0 &&
      state.recipientBankName.trim().length > 0 &&
      state.recipientAccountHolderName.trim().length > 0;
  const isValid = recipientValid && (!state.saveRecipient || state.saveLabel.trim().length > 0);

  let nextDisabledReason: string | null = null;
  if (!recipientValid) {
    if (isAlipayOrWechat) {
      if (!contactValid) {
        nextDisabledReason = state.useQrCode
          ? "Upload a QR code to continue"
          : `Enter the recipient's ${state.payoutMethod === "alipay" ? "Alipay ID" : "WeChat ID"}`;
      } else if (!state.recipientLastName.trim()) {
        nextDisabledReason = "Enter the recipient's last name";
      } else if (!state.recipientFirstName.trim()) {
        nextDisabledReason = "Enter the recipient's first name";
      }
    } else if (!state.recipientBankAccountNumber.trim()) {
      nextDisabledReason = "Enter the recipient's bank account number";
    } else if (!state.recipientBankName.trim()) {
      nextDisabledReason = "Enter the recipient's bank name";
    } else if (!state.recipientAccountHolderName.trim()) {
      nextDisabledReason = "Enter the recipient's account holder name";
    }
  } else if (state.saveRecipient && !state.saveLabel.trim()) {
    nextDisabledReason = "Name this recipient to save it";
  }

  function applySavedRecipient(recipient: SavedRmbRecipient) {
    onChange({
      payoutMethod: recipient.payout_method,
      recipientAlipayId: recipient.recipient_alipay_id ?? "",
      recipientWechatId: recipient.recipient_wechat_id ?? "",
      recipientFirstName: recipient.recipient_first_name ?? "",
      recipientLastName: recipient.recipient_last_name ?? "",
      recipientBankAccountNumber: recipient.recipient_bank_account_number ?? "",
      recipientBankName: recipient.recipient_bank_name ?? "",
      recipientAccountHolderName: recipient.recipient_account_holder_name ?? "",
      useQrCode: false,
      qrCodeFile: null,
      qrCodeFileName: "",
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Saved beneficiaries */}
      {savedRecipients.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-foreground/80">Use a saved recipient</p>
          <div className="flex flex-wrap gap-2">
            {savedRecipients.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => applySavedRecipient(r)}
                className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:border-primary-300 hover:text-primary-700"
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

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
      {(state.payoutMethod === "alipay" || state.payoutMethod === "wechat") && (
        <div className="flex flex-col gap-3">
          <div className="inline-flex w-fit items-center gap-1 rounded-lg bg-black/[.04] p-1">
            <button
              type="button"
              onClick={() => onChange({ useQrCode: false })}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                !state.useQrCode ? "bg-white text-primary-700" : "text-foreground/60"
              }`}
            >
              Enter manually
            </button>
            <button
              type="button"
              onClick={() => onChange({ useQrCode: true })}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                state.useQrCode ? "bg-white text-primary-700" : "text-foreground/60"
              }`}
            >
              Upload QR code
            </button>
          </div>

          {!state.useQrCode &&
            (state.payoutMethod === "alipay" ? (
              <Input
                label="Recipient phone number or email"
                id="recipientAlipayId"
                name="recipientAlipayId"
                type="text"
                placeholder="Phone number or email"
                value={state.recipientAlipayId}
                onChange={(e) => onChange({ recipientAlipayId: e.target.value })}
              />
            ) : (
              <Input
                label="Recipient phone number or email"
                id="recipientWechatId"
                name="recipientWechatId"
                type="text"
                placeholder="Phone number or email"
                value={state.recipientWechatId}
                onChange={(e) => onChange({ recipientWechatId: e.target.value })}
              />
            ))}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Last name"
              id="recipientLastName"
              name="recipientLastName"
              type="text"
              placeholder="Last name"
              value={state.recipientLastName}
              onChange={(e) => onChange({ recipientLastName: e.target.value })}
            />
            <Input
              label="First name"
              id="recipientFirstName"
              name="recipientFirstName"
              type="text"
              placeholder="First name"
              value={state.recipientFirstName}
              onChange={(e) => onChange({ recipientFirstName: e.target.value })}
            />
          </div>

          {state.useQrCode && (
            <FileDropzone
              label={`${state.payoutMethod === "alipay" ? "Alipay" : "WeChat Pay"} QR code`}
              accept="image/*"
              onFileSelected={(file) =>
                onChange({ qrCodeFile: file, qrCodeFileName: file?.name ?? "" })
              }
            />
          )}
        </div>
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

      {/* Save for next time */}
      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-white px-4 py-3">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground/80">
          <input
            type="checkbox"
            checked={state.saveRecipient}
            onChange={(e) => onChange({ saveRecipient: e.target.checked })}
            className="h-4 w-4 rounded border-border text-primary-600"
          />
          Save this recipient for next time
        </label>
        {state.saveRecipient && (
          <Input
            label="Name this recipient"
            id="saveLabel"
            name="saveLabel"
            type="text"
            placeholder="e.g. Mum's supplier"
            value={state.saveLabel}
            onChange={(e) => onChange({ saveLabel: e.target.value })}
          />
        )}
      </div>

      <div className="flex flex-col items-start gap-1.5">
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button disabled={!isValid} onClick={onNext} title={nextDisabledReason ?? undefined}>
            Next — Review
          </Button>
        </div>
        {nextDisabledReason && (
          <p className="text-xs text-foreground/50">{nextDisabledReason}</p>
        )}
      </div>
    </div>
  );
}

// ─── Step 3 — Confirmation ────────────────────────────────────────────────────

function ConfirmStep({
  state,
  onBack,
  onSubmit,
  actionState,
  pending,
}: {
  state: SendState;
  onBack: () => void;
  onSubmit: () => void;
  actionState: PaymentsActionState;
  pending: boolean;
}) {
  const amountNum = parseFloat(state.amount) || 0;
  const methodLabel = PAYOUT_METHODS.find((m) => m.value === state.payoutMethod)?.label ?? "";

  const isAlipayOrWechat = state.payoutMethod === "alipay" || state.payoutMethod === "wechat";
  const recipientSummary = isAlipayOrWechat
    ? (state.payoutMethod === "alipay" ? state.recipientAlipayId : state.recipientWechatId) ||
      `QR code: ${state.qrCodeFileName}`
    : `${state.recipientBankName} · ${state.recipientBankAccountNumber}`;

  const rows: { label: string; value: string }[] = [
    {
      label: "You send",
      value: `${CURRENCY_META[state.sourceCurrency].symbol}${amountNum.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${state.sourceCurrency}`,
    },
    { label: "Rate & fee", value: "Confirmed by our team during review" },
    { label: "Payout method", value: methodLabel },
    { label: "Recipient", value: recipientSummary },
    ...(isAlipayOrWechat
      ? [{ label: "Recipient name", value: `${state.recipientFirstName} ${state.recipientLastName}`.trim() }]
      : []),
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
          CNY transfers are processed manually by our team — the amount above will be held from your
          balance now, and we&rsquo;ll confirm the rate and complete your transfer within 1–2
          hours.
        </p>
      </div>

      {actionState.error && (
        <p className="text-sm text-danger-500">{actionState.error}</p>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button onClick={onSubmit} loading={pending}>
          {pending ? "Submitting…" : "Confirm & Submit Request"}
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
        <p className="text-base font-semibold">Request submitted!</p>
        <p className="mt-1 text-sm text-foreground/60">
          We&rsquo;ve received your transfer request and held the funds from your balance. Our team
          will confirm the rate and complete it within 1–2 hours — track its status on the
          Transactions page.
        </p>
      </div>
      <Button variant="secondary" onClick={onReset}>
        New transfer
      </Button>
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export function RmbExchangeForm({
  wallets,
  savedRecipients = [],
  tierRates,
  markupRate,
}: {
  wallets: Wallet[];
  savedRecipients?: SavedRmbRecipient[];
  tierRates: CnyTierRate[];
  markupRate: number;
}) {
  const [step, setStep] = useState<Step>("source");
  const [formState, setFormState] = useState<SendState>(DEFAULT_STATE);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [actionState, setActionState] = useState<PaymentsActionState>({});
  const router = useRouter();

  function patch(p: Partial<SendState>) {
    setFormState((s) => ({ ...s, ...p }));
  }

  function handleSubmit() {
    const fd = new FormData();
    fd.set("sourceCurrency", formState.sourceCurrency);
    fd.set("amount", formState.amount);
    fd.set("payoutMethod", formState.payoutMethod);
    fd.set("recipientAlipayId", formState.recipientAlipayId);
    fd.set("recipientWechatId", formState.recipientWechatId);
    fd.set("recipientFirstName", formState.recipientFirstName);
    fd.set("recipientLastName", formState.recipientLastName);
    fd.set("recipientBankAccountNumber", formState.recipientBankAccountNumber);
    fd.set("recipientBankName", formState.recipientBankName);
    fd.set("recipientAccountHolderName", formState.recipientAccountHolderName);
    if (formState.qrCodeFile) fd.set("qrCodeFile", formState.qrCodeFile);
    fd.set("saveRecipient", String(formState.saveRecipient));
    fd.set("saveLabel", formState.saveLabel);

    startTransition(async () => {
      const result = await submitRmbExchange({}, fd);
      setActionState(result);
      if (result.transactionId && !result.error) {
        setDone(true);
        // Wallet balances shown on this page (and its currency pickers) come from the server
        // component's initial fetch — refresh so the next transfer sees the real post-trade
        // balance instead of a stale pre-trade number.
        router.refresh();
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
          tierRates={tierRates}
          markupRate={markupRate}
        />
      )}

      {step === "recipient" && (
        <RecipientStep
          state={formState}
          onChange={patch}
          onBack={() => setStep("source")}
          onNext={() => setStep("confirm")}
          savedRecipients={savedRecipients}
        />
      )}

      {step === "confirm" && (
        <ConfirmStep
          state={formState}
          onBack={() => setStep("recipient")}
          onSubmit={handleSubmit}
          actionState={actionState}
          pending={isPending}
        />
      )}
    </Card>
  );
}

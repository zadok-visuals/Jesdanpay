"use client";

import { useState, useTransition } from "react";
import type { Wallet } from "@/lib/types/database";
import { formatBalance } from "@/lib/currency";
import { getCnyPayoutQuote, confirmCnyPayout, type KlashaActionState } from "@/lib/actions/klasha";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Stage = "amount" | "recipient" | "success";

export function KlashaCnyForm({
  sourceCurrency,
  sourceWallet,
  onBack,
}: {
  sourceCurrency: "NGN" | "GHS";
  sourceWallet: Wallet | undefined;
  onBack: () => void;
}) {
  const [stage, setStage] = useState<Stage>("amount");
  const [destinationAmount, setDestinationAmount] = useState("");
  const [quoteState, setQuoteState] = useState<KlashaActionState>({});
  const [confirmState, setConfirmState] = useState<KlashaActionState>({});
  const [isQuoting, startQuoting] = useTransition();
  const [isConfirming, startConfirming] = useTransition();

  const [recipient, setRecipient] = useState({
    accountName: "",
    accountNumber: "",
    bankCode: "",
    bankName: "",
    receiverFirstName: "",
    receiverLastName: "",
    receiverIdNumber: "",
    receiverMobileNumber: "",
  });

  function handleGetQuote() {
    const fd = new FormData();
    fd.set("sourceCurrency", sourceCurrency);
    fd.set("destinationAmount", destinationAmount);
    startQuoting(async () => {
      const result = await getCnyPayoutQuote({}, fd);
      setQuoteState(result);
      if (result.quote && !result.error) setStage("recipient");
    });
  }

  function handleConfirm() {
    if (!quoteState.quote) return;
    const fd = new FormData();
    fd.set("quotationId", String(quoteState.quote.quotationId));
    fd.set("sourceCurrency", quoteState.quote.sourceCurrency);
    fd.set("sourceAmount", quoteState.quote.sourceAmount);
    fd.set("destinationAmount", quoteState.quote.destinationAmount);
    fd.set("accountName", recipient.accountName);
    fd.set("accountNumber", recipient.accountNumber);
    fd.set("bankCode", recipient.bankCode);
    fd.set("bankName", recipient.bankName);
    fd.set("receiverFirstName", recipient.receiverFirstName);
    fd.set("receiverLastName", recipient.receiverLastName);
    fd.set("receiverIdNumber", recipient.receiverIdNumber);
    fd.set("receiverMobileNumber", recipient.receiverMobileNumber);

    startConfirming(async () => {
      const result = await confirmCnyPayout({}, fd);
      setConfirmState(result);
      if (result.transactionId && !result.error) setStage("success");
    });
  }

  const recipientValid =
    recipient.accountName.trim() &&
    recipient.accountNumber.trim() &&
    recipient.bankCode.trim() &&
    recipient.bankName.trim() &&
    recipient.receiverFirstName.trim() &&
    recipient.receiverLastName.trim() &&
    recipient.receiverIdNumber.trim() &&
    recipient.receiverMobileNumber.trim();

  if (stage === "success") {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-3xl">✅</div>
        <div>
          <p className="text-base font-semibold">Payout submitted!</p>
          <p className="mt-1 text-sm text-foreground/60">
            Klasha is settling your vendor payment — track its status on the Transactions page.
          </p>
        </div>
        <Button variant="secondary" onClick={onBack}>
          Done
        </Button>
      </div>
    );
  }

  if (stage === "recipient" && quoteState.quote) {
    return (
      <div className="flex flex-col gap-6">
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="border-b border-border bg-primary-50 px-6 py-4">
            <p className="text-sm font-semibold text-primary-800">Instant quote (Klasha)</p>
          </div>
          <dl className="divide-y divide-border">
            {[
              { label: "You pay", value: `${quoteState.quote.sourceAmount} ${sourceCurrency}` },
              { label: "Vendor receives", value: `¥${quoteState.quote.destinationAmount}` },
              { label: "Rate", value: `1 ${sourceCurrency} ≈ ${(1 / quoteState.quote.fxRate).toFixed(4)} CNY` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-4 px-6 py-3.5">
                <dt className="text-sm text-foreground/60">{label}</dt>
                <dd className="text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium text-foreground/80">China bank account</p>
          <Input
            label="Bank name"
            id="bankName"
            value={recipient.bankName}
            onChange={(e) => setRecipient((r) => ({ ...r, bankName: e.target.value }))}
          />
          <Input
            label="Bank code"
            id="bankCode"
            placeholder="From Klasha's supported-bank list"
            value={recipient.bankCode}
            onChange={(e) => setRecipient((r) => ({ ...r, bankCode: e.target.value }))}
          />
          <Input
            label="Account number"
            id="accountNumber"
            value={recipient.accountNumber}
            onChange={(e) => setRecipient((r) => ({ ...r, accountNumber: e.target.value }))}
          />
          <Input
            label="Account name (Chinese characters)"
            id="accountName"
            value={recipient.accountName}
            onChange={(e) => setRecipient((r) => ({ ...r, accountName: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Receiver first name"
              id="receiverFirstName"
              value={recipient.receiverFirstName}
              onChange={(e) => setRecipient((r) => ({ ...r, receiverFirstName: e.target.value }))}
            />
            <Input
              label="Receiver last name"
              id="receiverLastName"
              value={recipient.receiverLastName}
              onChange={(e) => setRecipient((r) => ({ ...r, receiverLastName: e.target.value }))}
            />
          </div>
          <Input
            label="Receiver ID number"
            id="receiverIdNumber"
            value={recipient.receiverIdNumber}
            onChange={(e) => setRecipient((r) => ({ ...r, receiverIdNumber: e.target.value }))}
          />
          <Input
            label="Receiver mobile number"
            id="receiverMobileNumber"
            placeholder="+86..."
            value={recipient.receiverMobileNumber}
            onChange={(e) => setRecipient((r) => ({ ...r, receiverMobileNumber: e.target.value }))}
          />
        </div>

        {confirmState.error && <p className="text-sm text-danger-500">{confirmState.error}</p>}

        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setStage("amount")} disabled={isConfirming}>
            Back
          </Button>
          <Button onClick={handleConfirm} loading={isConfirming} disabled={!recipientValid}>
            {isConfirming ? "Sending…" : "Confirm & Pay"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <label htmlFor="destinationAmount" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Amount vendor needs (CNY)
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-foreground/50">
            ¥
          </span>
          <input
            id="destinationAmount"
            type="number"
            min="0.01"
            step="0.01"
            value={destinationAmount}
            onChange={(e) => setDestinationAmount(e.target.value)}
            placeholder="0.00"
            className="h-11 w-full rounded-xl border border-border bg-white pl-8 pr-3.5 text-base outline-none transition-colors focus:border-primary-400 sm:text-sm"
          />
        </div>
        {sourceWallet && (
          <p className="mt-1.5 text-xs text-foreground/50">
            Your {sourceCurrency} balance: {formatBalance(sourceCurrency, sourceWallet.balance)}
          </p>
        )}
      </div>

      {quoteState.error && <p className="text-sm text-danger-500">{quoteState.error}</p>}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} disabled={isQuoting}>
          Back
        </Button>
        <Button
          onClick={handleGetQuote}
          loading={isQuoting}
          disabled={!destinationAmount || Number(destinationAmount) <= 0}
        >
          Get instant rate
        </Button>
      </div>
    </div>
  );
}

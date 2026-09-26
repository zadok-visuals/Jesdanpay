"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  setWithdrawalRecipient,
  requestRecipientChange,
  confirmRecipientChange,
  type WithdrawalActionState,
} from "@/lib/actions/withdrawals";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Currency, WithdrawalRecipient } from "@/lib/types/database";

const initialState: WithdrawalActionState = {};

// The per-currency payout-detail fields — shared by first-time setup and a change to an existing
// recipient, since both collect exactly the same fields for a given currency. `idPrefix` keeps
// element ids unique when a Setup form and a Change form for other currencies exist on the page
// at once.
function RecipientFields({
  currency,
  idPrefix,
  defaults,
}: {
  currency: Currency;
  idPrefix: string;
  defaults?: WithdrawalRecipient;
}) {
  if (currency === "USDT") {
    return (
      <div className="flex flex-col gap-1.5">
        <Input
          label="USDT wallet address (BSC network only)"
          id={`${idPrefix}-walletAddress`}
          name="walletAddress"
          type="text"
          required
          defaultValue={defaults?.wallet_address ?? ""}
          placeholder="Your USDT payout wallet address"
        />
        <p className="text-xs text-danger-500">
          Only send to a BSC (BNB Smart Chain) address — funds sent on any other network
          (TRC20, ERC20, etc.) cannot be recovered.
        </p>
      </div>
    );
  }
  if (currency === "KES") {
    // KES payouts go out over M-Pesa, not a bank rail — the phone number is stored in the same
    // bankAccountNumber field (no schema/mapping change needed), just relabeled here.
    return (
      <Input
        label="M-Pesa phone number"
        id={`${idPrefix}-bankAccountNumber`}
        name="bankAccountNumber"
        type="tel"
        required
        defaultValue={defaults?.bank_account_number ?? ""}
        placeholder="e.g. +254712345678"
      />
    );
  }
  return (
    <>
      <Input
        label="Bank account number"
        id={`${idPrefix}-bankAccountNumber`}
        name="bankAccountNumber"
        type="text"
        required
        defaultValue={defaults?.bank_account_number ?? ""}
        placeholder="Account number"
      />
      <Input
        label="Bank name"
        id={`${idPrefix}-bankName`}
        name="bankName"
        type="text"
        required
        defaultValue={defaults?.bank_name ?? ""}
        placeholder="Bank name"
      />
      {currency === "NGN" && (
        <Input
          label="Bank code"
          id={`${idPrefix}-bankCode`}
          name="bankCode"
          type="text"
          required
          defaultValue={defaults?.bank_code ?? ""}
          placeholder="Found in your bank's app or from your bank directly"
        />
      )}
    </>
  );
}

// First-time setup for a currency with no recipient yet — ungated, same as before (only a
// *change* to an existing recipient goes through the password-re-verified flow below).
function SetupForm({ currency }: { currency: Currency }) {
  const [state, formAction, pending] = useActionState(setWithdrawalRecipient, initialState);
  const idPrefix = `setup-${currency}`;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="currency" value={currency} />
      <Input
        label="Account holder name"
        id={`${idPrefix}-accountHolderName`}
        name="accountHolderName"
        type="text"
        required
        placeholder="Must match your KYC name exactly"
      />
      <RecipientFields currency={currency} idPrefix={idPrefix} />
      {state.error && <p className="text-sm text-danger-500">{state.error}</p>}
      <Button type="submit" loading={pending} className="self-start">
        {pending ? "Saving…" : "Save payout recipient"}
      </Button>
    </form>
  );
}

function RecipientDetail({ recipient }: { recipient: WithdrawalRecipient }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-white p-4 text-sm">
      <p>
        <span className="text-foreground/60">Account holder:</span>{" "}
        <span className="font-medium">{recipient.account_holder_name}</span>
      </p>
      {recipient.wallet_address ? (
        <p>
          <span className="text-foreground/60">Wallet address (BSC):</span>{" "}
          <span className="break-all font-medium">{recipient.wallet_address}</span>
        </p>
      ) : recipient.currency === "KES" ? (
        <p>
          <span className="text-foreground/60">M-Pesa phone number:</span>{" "}
          <span className="font-medium">{recipient.bank_account_number}</span>
        </p>
      ) : (
        <>
          <p>
            <span className="text-foreground/60">Bank:</span>{" "}
            <span className="font-medium">{recipient.bank_name}</span>
          </p>
          <p>
            <span className="text-foreground/60">Account number:</span>{" "}
            <span className="font-medium">{recipient.bank_account_number}</span>
          </p>
          {recipient.bank_code && (
            <p>
              <span className="text-foreground/60">Bank code:</span>{" "}
              <span className="font-medium">{recipient.bank_code}</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Password re-verification, requested via request_recipient_change (migration 0031) before this
// form even renders (see RecipientSection), then re-checked here alongside the password itself
// when confirm_recipient_change runs. Confirm dialog + toast per item 5, built in from the start.
function ChangeRecipientForm({
  currency,
  recipient,
  onDone,
  onCancel,
}: {
  currency: Currency;
  recipient: WithdrawalRecipient;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(confirmRecipientChange, initialState);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const idPrefix = `change-${currency}`;

  useEffect(() => {
    if (!submitted) return;
    setSubmitted(false);
    if (state.error) {
      toast.error(state.error);
    } else {
      toast.success(`${currency} recipient updated`);
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => setSubmitted(true)}
      className="flex flex-col gap-4 rounded-xl border border-border bg-white p-4"
    >
      <input type="hidden" name="currency" value={currency} />
      <Input
        label="Current password"
        id={`${idPrefix}-password`}
        name="password"
        type="password"
        required
        placeholder="Confirm it's you"
      />
      <Input
        label="Account holder name"
        id={`${idPrefix}-accountHolderName`}
        name="accountHolderName"
        type="text"
        required
        defaultValue={recipient.account_holder_name}
        placeholder="Must match your KYC name exactly"
      />
      <RecipientFields currency={currency} idPrefix={idPrefix} defaults={recipient} />
      {state.error && <p className="text-sm text-danger-500">{state.error}</p>}
      <div className="flex gap-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" onClick={() => setConfirmOpen(true)} loading={pending}>
          {pending ? "Saving…" : "Save new recipient"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm recipient change"
        message={`Change your saved ${currency} payout recipient? Future withdrawals will go to the new details.`}
        confirmLabel="Change recipient"
        loading={pending}
        onConfirm={() => {
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </form>
  );
}

function RecipientSection({
  currency,
  recipient,
}: {
  currency: Currency;
  recipient: WithdrawalRecipient | null;
}) {
  const [changing, setChanging] = useState(false);
  const [requesting, startRequesting] = useTransition();

  function startChange() {
    startRequesting(async () => {
      const result = await requestRecipientChange(currency);
      if (result.error) toast.error(result.error);
      else setChanging(true);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">{currency}</p>
      {!recipient ? (
        <SetupForm currency={currency} />
      ) : changing ? (
        <ChangeRecipientForm
          currency={currency}
          recipient={recipient}
          onDone={() => setChanging(false)}
          onCancel={() => setChanging(false)}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <RecipientDetail recipient={recipient} />
          <button
            type="button"
            onClick={startChange}
            disabled={requesting}
            className="self-start text-xs font-medium text-primary-700 underline hover:text-primary-800 disabled:opacity-60"
          >
            {requesting ? "Starting…" : "Change recipient"}
          </button>
        </div>
      )}
    </div>
  );
}

export function WithdrawalRecipientCard({
  recipients,
  availableCurrencies,
}: {
  recipients: WithdrawalRecipient[];
  availableCurrencies: Currency[];
}) {
  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold">Payout recipients</h2>
      <p className="mb-4 text-sm text-foreground/50">
        Where each currency&rsquo;s withdrawals are sent — one recipient per currency, and the
        account holder name must match your KYC name.
      </p>

      <div className="flex flex-col gap-6">
        {availableCurrencies.map((c) => (
          <RecipientSection key={c} currency={c} recipient={recipients.find((r) => r.currency === c) ?? null} />
        ))}
      </div>
    </Card>
  );
}

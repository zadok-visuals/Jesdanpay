"use client";

import { useActionState, useState } from "react";
import { setWithdrawalRecipient, type WithdrawalActionState } from "@/lib/actions/withdrawals";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { Currency, WithdrawalRecipient } from "@/lib/types/database";

const initialState: WithdrawalActionState = {};

function SetupForm({ availableCurrencies }: { availableCurrencies: Currency[] }) {
  const [state, formAction, pending] = useActionState(setWithdrawalRecipient, initialState);
  const [currency, setCurrency] = useState<Currency>(availableCurrencies[0] ?? "USDT");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-sm font-medium text-foreground/80">Currency</p>
        <div className="flex flex-wrap gap-2">
          {availableCurrencies.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                currency === c
                  ? "border-primary-400 bg-primary-50 text-primary-700 ring-1 ring-primary-400"
                  : "border-border bg-white text-foreground/70 hover:border-primary-300"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <input type="hidden" name="currency" value={currency} />
      </div>

      <Input
        label="Account holder name"
        id="accountHolderName"
        name="accountHolderName"
        type="text"
        required
        placeholder="Must match your KYC name exactly"
      />

      {currency === "USDT" ? (
        <div className="flex flex-col gap-1.5">
          <Input
            label="USDT wallet address (BSC network only)"
            id="walletAddress"
            name="walletAddress"
            type="text"
            required
            placeholder="Your USDT payout wallet address"
          />
          <p className="text-xs text-danger-500">
            Only send to a BSC (BNB Smart Chain) address — funds sent on any other network
            (TRC20, ERC20, etc.) cannot be recovered.
          </p>
        </div>
      ) : currency === "KES" ? (
        // KES payouts go out over M-Pesa, not a bank rail — the phone number is stored in the
        // same bankAccountNumber field (no schema/mapping change needed), just relabeled here.
        <Input
          label="M-Pesa phone number"
          id="bankAccountNumber"
          name="bankAccountNumber"
          type="tel"
          required
          placeholder="e.g. +254712345678"
        />
      ) : (
        <>
          <Input
            label="Bank account number"
            id="bankAccountNumber"
            name="bankAccountNumber"
            type="text"
            required
            placeholder="Account number"
          />
          <Input
            label="Bank name"
            id="bankName"
            name="bankName"
            type="text"
            required
            placeholder="Bank name"
          />
          {currency === "NGN" && (
            <Input
              label="Bank code"
              id="bankCode"
              name="bankCode"
              type="text"
              required
              placeholder="Found in your bank's app or from your bank directly"
            />
          )}
        </>
      )}

      {state.error && <p className="text-sm text-danger-500">{state.error}</p>}

      <Button type="submit" loading={pending} className="self-start">
        {pending ? "Saving…" : "Save payout recipient"}
      </Button>
    </form>
  );
}

export function WithdrawalRecipientCard({
  recipient,
  availableCurrencies,
}: {
  recipient: WithdrawalRecipient | null;
  availableCurrencies: Currency[];
}) {
  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold">Payout recipient</h2>
      <p className="mb-4 text-sm text-foreground/50">
        Where your withdrawals are sent. Only one recipient can be on file, and the account
        holder name must match your KYC name.
      </p>

      {recipient ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-white p-4 text-sm">
            <p>
              <span className="text-foreground/60">Currency:</span>{" "}
              <span className="font-medium">{recipient.currency}</span>
            </p>
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
          <div className="rounded-xl border border-dashed border-border bg-black/[.02] p-4">
            <p className="text-xs text-foreground/60">
              To change your payout recipient, we need to verify it&rsquo;s really you first.
              This step isn&rsquo;t live yet — contact support to update your payout details in
              the meantime.
            </p>
          </div>
        </div>
      ) : (
        <SetupForm availableCurrencies={availableCurrencies} />
      )}
    </Card>
  );
}

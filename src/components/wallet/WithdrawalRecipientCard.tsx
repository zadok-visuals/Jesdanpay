"use client";

import { useActionState, useState } from "react";
import { setWithdrawalRecipient, type WithdrawalActionState } from "@/lib/actions/withdrawals";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { Currency, WithdrawalRecipient } from "@/lib/types/database";

const CURRENCIES: Currency[] = ["NGN", "GHS", "KES", "USDT"];
const initialState: WithdrawalActionState = {};

function SetupForm() {
  const [state, formAction, pending] = useActionState(setWithdrawalRecipient, initialState);
  const [currency, setCurrency] = useState<Currency>("NGN");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-sm font-medium text-foreground/80">Currency</p>
        <div className="flex flex-wrap gap-2">
          {CURRENCIES.map((c) => (
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
        <Input
          label="USDT wallet address"
          id="walletAddress"
          name="walletAddress"
          type="text"
          required
          placeholder="Your USDT payout wallet address"
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
        </>
      )}

      {state.error && <p className="text-sm text-danger-500">{state.error}</p>}

      <Button type="submit" loading={pending} className="self-start">
        {pending ? "Saving…" : "Save payout recipient"}
      </Button>
    </form>
  );
}

export function WithdrawalRecipientCard({ recipient }: { recipient: WithdrawalRecipient | null }) {
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
                <span className="text-foreground/60">Wallet address:</span>{" "}
                <span className="break-all font-medium">{recipient.wallet_address}</span>
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
        <SetupForm />
      )}
    </Card>
  );
}

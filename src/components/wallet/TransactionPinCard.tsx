"use client";

import { useActionState } from "react";
import { setWithdrawalPin, type WithdrawalActionState } from "@/lib/actions/withdrawals";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

const initialState: WithdrawalActionState = {};

function SetupForm() {
  const [state, formAction, pending] = useActionState(setWithdrawalPin, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        label="Withdrawal PIN"
        id="pin"
        name="pin"
        type="password"
        inputMode="numeric"
        required
        minLength={4}
        maxLength={6}
        placeholder="4 to 6 digits"
      />
      {state.error && <p className="text-sm text-danger-500">{state.error}</p>}
      <Button type="submit" loading={pending} className="self-start">
        {pending ? "Saving…" : "Set withdrawal PIN"}
      </Button>
    </form>
  );
}

export function TransactionPinCard({ hasPin }: { hasPin: boolean }) {
  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold">Withdrawal PIN</h2>
      <p className="mb-4 text-sm text-foreground/50">
        A separate PIN, distinct from your login password, required to authorize every
        withdrawal request.
      </p>

      {hasPin ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-border bg-white p-4 text-sm">
            <p className="text-foreground/60">
              A withdrawal PIN is set on your account.
            </p>
          </div>
          <div className="rounded-xl border border-dashed border-border bg-black/[.02] p-4">
            <p className="text-xs text-foreground/60">
              To change your withdrawal PIN, we need to verify it&rsquo;s really you first. This
              step isn&rsquo;t live yet — contact support to update your PIN in the meantime.
            </p>
          </div>
        </div>
      ) : (
        <SetupForm />
      )}
    </Card>
  );
}

"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { setWithdrawalPin, changeWithdrawalPin, type WithdrawalActionState } from "@/lib/actions/withdrawals";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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

// Password re-verified change flow — same shape as WithdrawalRecipientCard.tsx's
// ChangeRecipientForm: useActionState + a ConfirmDialog gate before the real submit, a toast on
// the result, matching that UX exactly rather than inventing a new pattern for this card.
function ChangePinForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState(changeWithdrawalPin, initialState);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!submitted) return;
    setSubmitted(false);
    if (state.error) {
      toast.error(state.error);
    } else {
      toast.success("Withdrawal PIN updated");
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
      <Input
        label="Current password"
        id="pinChange-password"
        name="password"
        type="password"
        required
        placeholder="Confirm it's you"
      />
      <Input
        label="New withdrawal PIN"
        id="pinChange-pin"
        name="pin"
        type="password"
        inputMode="numeric"
        required
        minLength={4}
        maxLength={6}
        placeholder="4 to 6 digits"
      />
      {state.error && <p className="text-sm text-danger-500">{state.error}</p>}
      <div className="flex gap-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" onClick={() => setConfirmOpen(true)} loading={pending}>
          {pending ? "Saving…" : "Save new PIN"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm PIN change"
        message="Change your withdrawal PIN? You'll need the new PIN for every withdrawal going forward."
        confirmLabel="Change PIN"
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

export function TransactionPinCard({ hasPin }: { hasPin: boolean }) {
  const [changing, setChanging] = useState(false);

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold">Withdrawal PIN</h2>
      <p className="mb-4 text-sm text-foreground/50">
        A separate PIN, distinct from your login password, required to authorize every
        withdrawal request.
      </p>

      {hasPin ? (
        changing ? (
          <ChangePinForm onDone={() => setChanging(false)} onCancel={() => setChanging(false)} />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="rounded-xl border border-border bg-white p-4 text-sm">
              <p className="text-foreground/60">A withdrawal PIN is set on your account.</p>
            </div>
            <button
              type="button"
              onClick={() => setChanging(true)}
              className="self-start text-xs font-medium text-primary-700 underline hover:text-primary-800"
            >
              Change PIN
            </button>
          </div>
        )
      ) : (
        <SetupForm />
      )}
    </Card>
  );
}

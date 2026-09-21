"use client";

import { useActionState, useState } from "react";
import {
  completeRmbTransaction,
  markRmbProcessing,
  rejectRmbTransaction,
  type AdminActionState,
} from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { TransactionStatus } from "@/lib/types/database";

const initialState: AdminActionState = {};

function ActionButton({
  action,
  transactionId,
  label,
  variant,
}: {
  action: (prevState: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  transactionId: string;
  label: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="transactionId" value={transactionId} />
      <Button type="submit" size="sm" variant={variant} loading={pending}>
        {label}
      </Button>
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
    </form>
  );
}

function CompleteForm({ transactionId }: { transactionId: string }) {
  const [state, formAction, pending] = useActionState(completeRmbTransaction, initialState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Mark completed
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex w-full flex-col items-end gap-2 sm:w-64"
    >
      <input type="hidden" name="transactionId" value={transactionId} />
      <Input
        label="Actual CNY delivered"
        id={`actualTargetAmount-${transactionId}`}
        name="actualTargetAmount"
        type="number"
        min="0.01"
        step="0.01"
        placeholder="0.00"
        required
        className="w-full"
      />
      <Input
        label="Note (optional)"
        id={`note-${transactionId}`}
        name="note"
        type="text"
        placeholder="e.g. rate used, settlement notes"
        className="w-full"
      />
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={pending}>
          Confirm
        </Button>
      </div>
    </form>
  );
}

export function RmbQueueActions({
  transactionId,
  status,
}: {
  transactionId: string;
  status: TransactionStatus;
}) {
  if (status === "completed" || status === "failed") {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
      {status === "pending" && (
        <ActionButton action={markRmbProcessing} transactionId={transactionId} label="Mark processing" />
      )}
      {status === "processing" && <CompleteForm transactionId={transactionId} />}
      <ActionButton
        action={rejectRmbTransaction}
        transactionId={transactionId}
        label="Reject"
        variant="danger"
      />
    </div>
  );
}

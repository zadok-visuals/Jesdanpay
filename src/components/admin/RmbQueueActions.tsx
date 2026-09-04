"use client";

import { useActionState } from "react";
import {
  markRmbCompleted,
  markRmbProcessing,
  rejectRmbTransaction,
  type AdminActionState,
} from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";
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
    <div className="flex shrink-0 gap-2">
      {status === "pending" && (
        <ActionButton action={markRmbProcessing} transactionId={transactionId} label="Mark processing" />
      )}
      {status === "processing" && (
        <ActionButton action={markRmbCompleted} transactionId={transactionId} label="Mark completed" />
      )}
      <ActionButton
        action={rejectRmbTransaction}
        transactionId={transactionId}
        label="Reject"
        variant="danger"
      />
    </div>
  );
}

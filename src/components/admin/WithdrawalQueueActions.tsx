"use client";

import { useActionState } from "react";
import { completeWithdrawal, rejectWithdrawal, type AdminActionState } from "@/lib/actions/admin";
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

export function WithdrawalQueueActions({
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
      <ActionButton action={completeWithdrawal} transactionId={transactionId} label="Mark paid out" />
      <ActionButton action={rejectWithdrawal} transactionId={transactionId} label="Reject" variant="danger" />
    </div>
  );
}

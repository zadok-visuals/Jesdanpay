"use client";

import { useActionState } from "react";
import { approveKyc, rejectKyc, type AdminActionState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";

const initialState: AdminActionState = {};

function ActionButton({
  action,
  userId,
  label,
  variant,
}: {
  action: (prevState: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  userId: string;
  label: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" size="sm" variant={variant} loading={pending}>
        {label}
      </Button>
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
    </form>
  );
}

export function KycQueueActions({ userId }: { userId: string }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
      <ActionButton action={approveKyc} userId={userId} label="Approve" />
      <ActionButton action={rejectKyc} userId={userId} label="Reject" variant="danger" />
    </div>
  );
}

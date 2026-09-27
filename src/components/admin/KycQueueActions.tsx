"use client";

import { useState } from "react";
import { useActionState } from "react";
import { approveKyc, rejectKyc, type AdminActionState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";

const initialState: AdminActionState = {};

function ApproveAction({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(approveKyc, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" size="sm" loading={pending}>
        Approve
      </Button>
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
    </form>
  );
}

// Rejection requires a reason so the user actually learns what to fix (see the KYC status page) —
// the button stays disabled until something is typed, same as every other required-field gate in
// this app.
function RejectAction({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(rejectKyc, initialState);
  const [reason, setReason] = useState("");

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="userId" value={userId} />
      <input
        type="text"
        name="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for rejection (required)"
        required
        className="w-56 rounded-lg border border-border px-3 py-1.5 text-xs outline-none focus:border-primary-400"
      />
      <Button type="submit" size="sm" variant="danger" loading={pending} disabled={!reason.trim()}>
        Reject
      </Button>
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
    </form>
  );
}

export function KycQueueActions({ userId }: { userId: string }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
      <ApproveAction userId={userId} />
      <RejectAction userId={userId} />
    </div>
  );
}

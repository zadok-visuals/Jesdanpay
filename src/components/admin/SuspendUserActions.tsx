"use client";

import { useState, useActionState } from "react";
import { suspendUser, releaseUser, type AdminActionState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";

const initialState: AdminActionState = {};

// Mirrors KycQueueActions.tsx's RejectAction pattern exactly — an inline reason input, button
// stays disabled until something's typed, so a suspension always comes with an explanation the
// user will see on /account-suspended.
function SuspendAction({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(suspendUser, initialState);
  const [reason, setReason] = useState("");

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="userId" value={userId} />
      <input
        type="text"
        name="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for suspension (required)"
        required
        className="w-64 rounded-lg border border-border px-3 py-1.5 text-xs outline-none focus:border-primary-400"
      />
      <Button type="submit" size="sm" variant="danger" loading={pending} disabled={!reason.trim()}>
        Suspend account
      </Button>
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
    </form>
  );
}

function ReleaseAction({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(releaseUser, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" size="sm" loading={pending}>
        Release account
      </Button>
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
    </form>
  );
}

export function SuspendUserActions({ userId, suspended }: { userId: string; suspended: boolean }) {
  return suspended ? <ReleaseAction userId={userId} /> : <SuspendAction userId={userId} />;
}

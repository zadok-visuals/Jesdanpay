"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { removeAdmin, type RemoveAdminState } from "@/lib/actions/admin";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const initialState: RemoveAdminState = {};

export function RemoveAdminButton({
  adminUserId,
  email,
  disabledReason,
}: {
  adminUserId: string;
  email: string;
  // Set when removeAdmin's own server-side guard (see src/lib/actions/admin.ts) would reject this
  // removal anyway — own row, or the last remaining super_admin. Disables the button rather than
  // hiding it, with this text as the tooltip, so it's never a confusing dead click.
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(removeAdmin, initialState);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!submitted) return;
    setSubmitted(false);
    if (state.error) toast.error(state.error);
    // No success toast needed — the row just disappears from the list on revalidate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <form ref={formRef} action={formAction} onSubmit={() => setSubmitted(true)}>
        <input type="hidden" name="adminUserId" value={adminUserId} />
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={pending || !!disabledReason}
          title={disabledReason}
          className="text-xs font-medium text-danger-500 hover:underline disabled:cursor-not-allowed disabled:text-foreground/30 disabled:no-underline"
        >
          {pending ? "Removing…" : "Remove"}
        </button>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        title="Remove admin access"
        message={`Revoke admin access for ${email}? Their account and data are untouched — this only removes their ability to sign into the admin panel.`}
        confirmLabel="Remove"
        danger
        loading={pending}
        onConfirm={() => {
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

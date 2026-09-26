"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

// One shared "are you sure?" primitive for every action that fires immediately today with no
// confirm step — logout, withdrawals, conversions, and (once built) recipient changes — instead
// of a bespoke modal per consumer. Plain text + Cancel/Confirm, matching the "lightweight" bar the
// request set; not a replacement for any existing full confirmation *screen* (e.g. WithdrawForm's
// post-success state), which stays as-is.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="mb-6 text-sm text-foreground/70">{message}</p>
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

"use client";

import { useActionState, useState } from "react";
import {
  completeRmbTransaction,
  createRmbProofUploadUrl,
  markRmbProcessing,
  rejectRmbTransaction,
  type AdminActionState,
} from "@/lib/actions/admin";
import { uploadToSignedUrl } from "@/lib/storage/clientUpload";
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
    <form action={formAction} className="flex w-full min-w-0 flex-col items-stretch gap-1 sm:w-auto sm:items-end">
      <input type="hidden" name="transactionId" value={transactionId} />
      <Button type="submit" size="sm" variant={variant} loading={pending} className="w-full sm:w-auto">
        {label}
      </Button>
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
    </form>
  );
}

// Rejection requires a reason so the user actually learns what to fix (see the KYC rejection
// pattern this mirrors, src/components/admin/KycQueueActions.tsx) — the button stays disabled
// until something is typed, same as every other required-field gate in this app.
function RejectAction({ transactionId }: { transactionId: string }) {
  const [state, formAction, pending] = useActionState(rejectRmbTransaction, initialState);
  const [reason, setReason] = useState("");

  return (
    <form action={formAction} className="flex w-full min-w-0 flex-col items-stretch gap-1.5 sm:w-64">
      <input type="hidden" name="transactionId" value={transactionId} />
      {/* text-base (not text-xs) below 16px triggers iOS Safari's auto-zoom on focus — same fix
          as Input.tsx's own default sizing, applied here since this is a plain input rather than
          that shared component. */}
      <input
        type="text"
        name="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for rejection (required)"
        required
        className="w-full max-w-full rounded-lg border border-border px-3 py-1.5 text-base outline-none focus:border-primary-400 sm:text-sm"
      />
      <Button type="submit" size="sm" variant="danger" loading={pending} disabled={!reason.trim()} className="w-full sm:w-auto sm:self-end">
        Reject
      </Button>
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
    </form>
  );
}

function CompleteForm({ transactionId }: { transactionId: string }) {
  const [state, formAction, pending] = useActionState(completeRmbTransaction, initialState);
  const [open, setOpen] = useState(false);
  const [proofPath, setProofPath] = useState<string | null>(null);
  const [proofFileName, setProofFileName] = useState<string | null>(null);
  const [proofStatus, setProofStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [proofError, setProofError] = useState<string | null>(null);

  // Two steps because the file never passes through this form's own server action (that would
  // hit the 1MB body limit) — first ask the server for a signed upload token scoped to this
  // transaction's own user folder (createRmbProofUploadUrl), then upload straight to Storage with
  // it. Only the resulting path is submitted with the rest of the form.
  async function handleProofFile(file: File) {
    setProofFileName(file.name);
    setProofStatus("uploading");
    setProofError(null);
    setProofPath(null);
    try {
      const prep = await createRmbProofUploadUrl(transactionId, file.name);
      if (prep.error || !prep.path || !prep.token) {
        throw new Error(prep.error ?? "We could not prepare the upload. Please try again.");
      }
      const path = await uploadToSignedUrl({ bucket: "rmb-payment-proof", path: prep.path, token: prep.token, file });
      setProofPath(path);
      setProofStatus("idle");
    } catch (err) {
      setProofStatus("error");
      setProofError(err instanceof Error ? err.message : "We could not upload that file. Please try again.");
    }
  }

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
      className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:w-72"
    >
      <input type="hidden" name="transactionId" value={transactionId} />
      <input type="hidden" name="proofRef" value={proofPath ?? ""} />
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
      <div className="flex w-full flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground/80">Payment proof (screenshot of the transfer)</label>
        <label
          className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-3 text-center transition-colors ${
            proofStatus === "uploading"
              ? "cursor-wait border-border opacity-70"
              : "cursor-pointer border-border hover:border-primary-300 hover:bg-primary-50"
          }`}
        >
          <span className="text-xs text-foreground/50">
            {proofStatus === "uploading"
              ? `Uploading ${proofFileName}…`
              : proofPath
                ? `✓ ${proofFileName ?? "Uploaded"}`
                : "Click to upload (optional)"}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={proofStatus === "uploading"}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              if (file) handleProofFile(file);
            }}
          />
        </label>
        {proofStatus === "error" && proofError && <p className="text-xs text-danger-500">{proofError}</p>}
      </div>
      {state.error && <p className="text-xs text-danger-500">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={pending || proofStatus === "uploading"}>
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
    <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-start">
      {status === "pending" && (
        <ActionButton action={markRmbProcessing} transactionId={transactionId} label="Mark processing" />
      )}
      {status === "processing" && <CompleteForm transactionId={transactionId} />}
      <RejectAction transactionId={transactionId} />
    </div>
  );
}

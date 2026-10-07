"use client";

import { useId, useState } from "react";
import { uploadToStorage } from "@/lib/storage/clientUpload";

interface FileDropzoneProps {
  label: string;
  accept?: string;
  bucket: string;
  userId: string;
  prefix: string;
  // The uploaded storage path once a file finishes uploading, or null while nothing's uploaded
  // yet (including while an upload is in flight — the parent's "is this ready" checks can just
  // test this for non-null without separately tracking an uploading flag).
  path: string | null;
  // fileName is passed alongside the path on a successful upload only, so a parent that wants to
  // display "which file" outside this component (e.g. a confirmation-step summary row) doesn't
  // need to separately track it — most callers only need the path and can ignore the 2nd arg.
  onUploaded: (path: string | null, fileName?: string) => void;
}

// Uploads immediately on selection (straight to Storage from the browser — see
// clientUpload.ts's header comment for why), rather than deferring to form submission. The
// parent only ever receives the resulting storage path via onUploaded, never the raw File, so a
// server action using this value only ever handles a small string.
export function FileDropzone({ label, accept = "image/*,.pdf", bucket, userId, prefix, path, onUploaded }: FileDropzoneProps) {
  const id = useId();
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">(path ? "idle" : "idle");
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setFileName(file.name);
    setStatus("uploading");
    setError(null);
    onUploaded(null);
    try {
      const uploadedPath = await uploadToStorage({ bucket, userId, prefix, file });
      setStatus("idle");
      onUploaded(uploadedPath, file.name);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "We could not upload that file. Please try a smaller photo or try again.");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          status === "uploading"
            ? "cursor-wait border-border opacity-70"
            : "cursor-pointer border-border hover:border-primary-300 hover:bg-primary-50"
        }`}
      >
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-foreground/50">
          {status === "uploading"
            ? `Uploading ${fileName}…`
            : path
              ? `✓ ${fileName ?? "Uploaded"}`
              : "Click to upload (image or PDF)"}
        </span>
        <input
          id={id}
          type="file"
          accept={accept}
          className="hidden"
          disabled={status === "uploading"}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            if (file) handleFile(file);
          }}
        />
      </label>
      {status === "error" && error && <p className="text-xs text-danger-500">{error}</p>}
    </div>
  );
}

"use client";

import { useId, useState } from "react";

interface FileDropzoneProps {
  label: string;
  accept?: string;
  onFileSelected: (file: File | null) => void;
}

export function FileDropzone({ label, accept = "image/*,.pdf", onFileSelected }: FileDropzoneProps) {
  const id = useId();
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary-300 hover:bg-primary-50"
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-xs text-foreground/50">
        {fileName ?? "Click to upload (image or PDF)"}
      </span>
      <input
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          setFileName(file?.name ?? null);
          onFileSelected(file);
        }}
      />
    </label>
  );
}

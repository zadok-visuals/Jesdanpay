"use client";

import { useState } from "react";
import { uploadToSignedUrl } from "@/lib/storage/clientUpload";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

// Downsizes to at most MAX_DIMENSION on the longest side and re-encodes as JPEG, same approach as
// clientUpload.ts's own compressImage — only invoked here when the file is already above the 1MB
// mark, since a small screenshot/photo rarely needs it. Falls back to the original file untouched
// on any failure (an exotic format, no canvas context) rather than blocking the upload.
async function compressIfLarge(file: File): Promise<File> {
  if (file.size <= 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return file;
    return new File([blob], file.name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export type AttachmentStatus = "idle" | "uploading" | "ready" | "error";

export interface ChatAttachment {
  ref: string;
  previewUrl: string;
  fileName: string;
}

// Shared by the user chat panel and the admin thread — the only difference between them is which
// server action mints the signed upload URL (own folder vs. a given customer's folder), passed in
// as `createUploadUrl`.
export function useChatAttachmentUpload(createUploadUrl: (fileName: string, fileSize: number, mimeType: string) => Promise<{ error?: string; path?: string; token?: string }>) {
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [status, setStatus] = useState<AttachmentStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  async function pickFile(file: File) {
    setError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only JPEG, PNG, WebP or GIF images are allowed.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That image is too large (max 5MB).");
      return;
    }

    setStatus("uploading");
    const previewUrl = URL.createObjectURL(file);
    try {
      const uploadFile = await compressIfLarge(file);
      const { error: urlError, path, token } = await createUploadUrl(uploadFile.name, uploadFile.size, uploadFile.type);
      if (urlError || !path || !token) {
        setStatus("error");
        setError(urlError ?? "We could not prepare the upload. Please try again.");
        URL.revokeObjectURL(previewUrl);
        return;
      }
      const ref = await uploadToSignedUrl({ bucket: "support-attachments", path, token, file: uploadFile });
      setAttachment({ ref, previewUrl, fileName: file.name });
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "We could not upload that image. Please try again.");
      URL.revokeObjectURL(previewUrl);
    }
  }

  function clear() {
    if (attachment) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
    setStatus("idle");
    setError(null);
  }

  return { attachment, status, error, pickFile, clear };
}

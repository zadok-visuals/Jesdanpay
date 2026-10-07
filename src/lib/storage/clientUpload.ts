// Browser-only. Uploads a user-selected file directly from the client to a private Supabase
// Storage bucket, bypassing server actions entirely for the file bytes themselves.
//
// Why this exists: KYC selfies/proof-of-address and RMB recipient QR screenshots were previously
// sent as part of a server action's FormData — a real phone photo (3-8MB) blew straight through
// Next's default 1MB server action body limit (and Vercel's ~4.5MB function body limit above
// that), so the action's request was rejected before it ever ran. No try/catch in the action ever
// fired, there was no error boundary, so the user just saw the framework's generic error page —
// confirmed live. Uploading straight to storage from the browser (the bucket's own RLS policy
// already allows a user to write into their own `${userId}/...` folder — see migration 0001 for
// kyc-documents, migration 0016 for rmb-recipient-qr) sidesteps the server action size limit
// altogether; only a small string (the resulting storage path) ever goes through the action.
import { createClient } from "@/lib/supabase/client";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

// Never shows the real Supabase error text to the user (that's provider internals, and can be
// confusing/leaky) — same "log the real thing, show one clean message" discipline as
// toCustomerError on the server side.
const FRIENDLY_UPLOAD_ERROR = "We could not upload that file. Please try a smaller photo or try again.";

function randomId(): string {
  // 16 hex chars is plenty of entropy for a filename component and needs no extra dependency —
  // crypto.randomUUID() is available in every browser this app targets (secure contexts only,
  // which both production HTTPS and localhost satisfy).
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

// Extension is derived from the (possibly re-encoded) file's own MIME type first — never trusted
// from the original, user-controlled file name — falling back to a short alnum suffix of the
// original name only if the MIME type is unrecognized, and "bin" if even that fails.
function sanitizedExtension(file: File): string {
  switch (file.type.toLowerCase()) {
    case "application/pdf":
      return "pdf";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/heic":
    case "image/heif":
      return "heic";
    default: {
      const match = /\.([a-zA-Z0-9]{1,5})$/.exec(file.name);
      return match ? match[1].toLowerCase() : "bin";
    }
  }
}

// Downsizes to at most MAX_IMAGE_DIMENSION on the longest side and re-encodes as JPEG at ~0.8
// quality via a canvas — no image-processing dependency needed. A phone photo easily runs
// 8-12MB at full resolution; this gets it down to a few hundred KB in the common case, well
// under both the bucket's own sanity and the UX cost of uploading a multi-megabyte file on a
// mobile connection. Falls back to the original file untouched if the browser can't decode it
// (an exotic format createImageBitmap doesn't support) or has no canvas 2D context — a failed
// compression attempt should never block the upload outright.
async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
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

export interface UploadToStorageOptions {
  bucket: string;
  userId: string;
  prefix: string;
  file: File;
}

// Returns the resulting storage path (always "${userId}/${prefix}-${timestamp}-${randomId}.ext",
// never the original file name) or throws a friendly, already-safe-to-display Error.
export async function uploadToStorage({ bucket, userId, prefix, file }: UploadToStorageOptions): Promise<string> {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  if (!isImage && !isPdf) {
    throw new Error("Only image or PDF files are allowed.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("That file is too large (max 8MB). Please choose a smaller file.");
  }

  const uploadFile = isImage ? await compressImage(file) : file;
  const path = `${userId}/${prefix}-${Date.now()}-${randomId()}.${sanitizedExtension(uploadFile)}`;

  const supabase = createClient();
  const { error } = await supabase.storage.from(bucket).upload(path, uploadFile, {
    contentType: uploadFile.type || undefined,
  });
  if (error) {
    console.error("[uploadToStorage]", { bucket, prefix, message: error.message });
    throw new Error(FRIENDLY_UPLOAD_ERROR);
  }
  return path;
}

export interface UploadToSignedUrlOptions {
  bucket: string;
  path: string;
  token: string;
  file: File;
}

// For uploads into a folder the current browser session has no RLS insert grant on — e.g. an
// admin attaching payment proof into a CUSTOMER's own folder (see createRmbProofUploadUrl,
// src/lib/actions/admin.ts). The server mints a short-lived signed upload token (service-role,
// bypasses RLS) and this just finishes the upload with it, reusing the same size/type checks and
// image compression as uploadToStorage above.
export async function uploadToSignedUrl({ bucket, path, token, file }: UploadToSignedUrlOptions): Promise<string> {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  if (!isImage && !isPdf) {
    throw new Error("Only image or PDF files are allowed.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("That file is too large (max 8MB). Please choose a smaller file.");
  }

  const uploadFile = isImage ? await compressImage(file) : file;

  const supabase = createClient();
  const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, uploadFile, {
    contentType: uploadFile.type || undefined,
  });
  if (error) {
    console.error("[uploadToSignedUrl]", { bucket, path, message: error.message });
    throw new Error(FRIENDLY_UPLOAD_ERROR);
  }
  return path;
}

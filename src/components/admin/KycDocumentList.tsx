import type { KycDocument } from "@/lib/types/database";

// "bvn_or_nin" -> "Bvn or nin" — good enough for an internal admin label, no lookup table needed.
export function humanizeDocumentType(type: string): string {
  const spaced = type.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Shared between the KYC review queue (src/app/admin/kyc/page.tsx) and the per-user detail view
// (src/app/admin/users/[id]/page.tsx) — a kyc_documents row either has a file_ref (render as a
// signed "View document" link) or a plain value column (phone number, BVN/NIN, TIN, ownership
// structure — see src/lib/actions/kyc.ts), rendered as text. signedUrlByRef must already be
// populated by the caller (one batched createSignedUrls call, not one per document/page).
export function KycDocumentList({
  docs,
  signedUrlByRef,
}: {
  docs: KycDocument[];
  signedUrlByRef: Map<string, string>;
}) {
  if (docs.length === 0) {
    return <span className="text-xs text-foreground/50">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {docs.map((d) => {
        const url = d.file_ref ? signedUrlByRef.get(d.file_ref) : undefined;
        if (url) {
          return (
            <a
              key={d.id}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary-600 hover:underline"
            >
              {d.document_type} — View document
            </a>
          );
        }
        return (
          <span key={d.id} className="text-foreground/60">
            {humanizeDocumentType(d.document_type)}
            {d.value != null ? `: ${d.value}` : ""}
          </span>
        );
      })}
    </div>
  );
}

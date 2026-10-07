import type { KycDocument } from "@/lib/types/database";

// Explicit labels for every document_type a reviewer actually needs to recognize at a glance —
// "selfie" rows are from before the identity step moved from a face-match selfie to a government
// ID photo (see src/lib/actions/kyc.ts), kept exactly as-is in the database so old submissions
// stay readable, just labelled to make clear they predate the current flow.
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  government_id: "Government issued ID",
  gov_id_number: "Gov ID No",
  gov_id_type: "ID type (written by user)",
  bvn_or_nin: "BVN or NIN",
  selfie: "Selfie (older submission)",
};

// "bvn_or_nin" -> "Bvn or nin" fallback for anything not in the explicit table above — good
// enough for a document_type with no special label (TIN, ownership structure, etc.), no lookup
// table needed for those.
export function humanizeDocumentType(type: string): string {
  if (DOCUMENT_TYPE_LABELS[type]) return DOCUMENT_TYPE_LABELS[type];
  const spaced = type.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Shared between the KYC review queue (src/app/admin/kyc/page.tsx) and the per-user detail view
// (src/app/admin/users/[id]/page.tsx) — a kyc_documents row either has a file_ref (render as a
// signed "View document" link) or a plain value column (phone number, BVN/NIN, gov ID number/
// type, TIN, ownership structure — see src/lib/actions/kyc.ts), rendered as text.
// signedUrlByRef must already be populated by the caller (one batched createSignedUrls call, not
// one per document/page).
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

  // gov_id_number/gov_id_type are shown INLINE next to the government ID photo below, not as
  // their own separate list entries — a reviewer comparing the typed number/ID type against the
  // actual photo shouldn't have to hunt across a flat wrapped list for them. BVN/NIN (Nigerian
  // users) is included the same way since it serves the identical comparison purpose. Unique per
  // (user_id, document_type), so at most one of each here.
  const govIdNumber = docs.find((d) => d.document_type === "gov_id_number")?.value;
  const govIdType = docs.find((d) => d.document_type === "gov_id_type")?.value;
  const bvnOrNin = docs.find((d) => d.document_type === "bvn_or_nin")?.value;
  const inlinedTypes = new Set(["gov_id_number", "gov_id_type"]);

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {docs
        .filter((d) => !inlinedTypes.has(d.document_type))
        .map((d) => {
          const url = d.file_ref ? signedUrlByRef.get(d.file_ref) : undefined;
          if (url) {
            const compareText =
              d.document_type === "government_id"
                ? [
                    govIdNumber ? `No: ${govIdNumber}` : null,
                    govIdType ? `Type: ${govIdType}` : null,
                    bvnOrNin ? `BVN/NIN: ${bvnOrNin}` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")
                : "";
            return (
              <a
                key={d.id}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary-600 hover:underline"
              >
                {humanizeDocumentType(d.document_type)} — View document
                {compareText && <span className="font-normal text-foreground/50"> ({compareText})</span>}
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

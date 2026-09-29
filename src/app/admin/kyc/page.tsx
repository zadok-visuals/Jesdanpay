import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { KycQueueActions } from "@/components/admin/KycQueueActions";
import { QueueFilters } from "@/components/admin/QueueFilters";
import { Pagination } from "@/components/admin/Pagination";
import { resolveUserIdsByEmail } from "@/lib/admin/search";
import { ADMIN_PAGE_SIZE, pageRange, parsePageParam, parseStringParam, type AdminSearchParams } from "@/lib/admin/pagination";

// "bvn_or_nin" -> "Bvn or nin" — good enough for an internal admin label, no lookup table needed.
function humanizeDocumentType(type: string): string {
  const spaced = type.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export default async function AdminKycPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const admin = createAdminClient();
  const params = await searchParams;
  const page = parsePageParam(params);
  const email = parseStringParam(params, "email");
  const from = parseStringParam(params, "from");
  const to = parseStringParam(params, "to");

  const userIdsFilter = await resolveUserIdsByEmail(admin, email);
  if (email && (userIdsFilter?.length ?? 0) === 0) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold">KYC Review</h1>
        <QueueFilters basePath="/admin/kyc" email={email} from={from} to={to} />
        <Card className="p-10 text-center text-sm text-foreground/50">No matching KYC submissions.</Card>
      </div>
    );
  }

  let query = admin
    .from("profiles")
    .select("id, email, full_name, kyc_type, created_at", { count: "exact" })
    .eq("kyc_status", "pending")
    .order("created_at", { ascending: false });

  if (userIdsFilter) query = query.in("id", userIdsFilter);
  if (from) query = query.gte("created_at", new Date(from).toISOString());
  if (to) query = query.lte("created_at", new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000).toISOString());

  const [fromRow, toRow] = pageRange(page);
  const { data: pendingProfiles, count } = await query.range(fromRow, toRow);

  const kycUserIds = (pendingProfiles ?? []).map((p) => p.id);
  const { data: kycDocuments } = kycUserIds.length
    ? await admin.from("kyc_documents").select("*").in("user_id", kycUserIds).eq("status", "pending")
    : { data: [] };

  const documentsByUser = new Map<string, typeof kycDocuments>();
  for (const doc of kycDocuments ?? []) {
    documentsByUser.set(doc.user_id, [...(documentsByUser.get(doc.user_id) ?? []), doc]);
  }

  // Signed URLs so an admin can actually view an uploaded ID/selfie/etc. without the bucket being
  // public — same pattern as the RMB recipient QR codes in src/app/admin/rmb/page.tsx, one batched
  // call for every pending document across all profiles on this page rather than one per document.
  const fileRefs = (kycDocuments ?? []).map((d) => d.file_ref).filter((ref): ref is string => !!ref);
  const signedUrlByRef = new Map<string, string>();
  if (fileRefs.length) {
    const { data: signedUrls } = await admin.storage.from("kyc-documents").createSignedUrls(fileRefs, 3600);
    for (const entry of signedUrls ?? []) {
      if (entry.signedUrl) signedUrlByRef.set(entry.path ?? "", entry.signedUrl);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">KYC Review</h1>
      <QueueFilters basePath="/admin/kyc" email={email} from={from} to={to} />
      {!pendingProfiles || pendingProfiles.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">No pending KYC submissions match these filters.</Card>
      ) : (
        <div className="flex flex-col gap-4">
          {pendingProfiles.map((profile) => {
            const docs = documentsByUser.get(profile.id) ?? [];
            return (
              <Card key={profile.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{profile.full_name || profile.email}</span>
                    <Pill tone="warning">{profile.kyc_type ?? "unknown"}</Pill>
                  </div>
                  <p className="text-xs text-foreground/50">
                    {docs.length} document{docs.length === 1 ? "" : "s"} submitted:
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {docs.length === 0 && <span className="text-foreground/50">—</span>}
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
                      // BUG: a kyc_documents row with no file_ref (phone_number, bvn_or_nin, tin,
                      // ownership_structure — see src/lib/actions/kyc.ts) stores its actual
                      // submitted value in the `value` column, but this only ever rendered the
                      // document_type label — an admin reviewing KYC could see that a BVN/phone
                      // number was submitted, never the actual number to verify against.
                      return (
                        <span key={d.id} className="text-foreground/60">
                          {humanizeDocumentType(d.document_type)}
                          {d.value != null ? `: ${d.value}` : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <KycQueueActions userId={profile.id} />
              </Card>
            );
          })}
        </div>
      )}
      <Pagination page={page} pageSize={ADMIN_PAGE_SIZE} totalCount={count ?? 0} basePath="/admin/kyc" searchParams={params} />
    </div>
  );
}

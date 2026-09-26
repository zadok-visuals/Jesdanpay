import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { KycQueueActions } from "@/components/admin/KycQueueActions";
import { QueueFilters } from "@/components/admin/QueueFilters";
import { Pagination } from "@/components/admin/Pagination";
import { resolveUserIdsByEmail } from "@/lib/admin/search";
import { ADMIN_PAGE_SIZE, pageRange, parsePageParam, parseStringParam, type AdminSearchParams } from "@/lib/admin/pagination";

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
                    {docs.length} document{docs.length === 1 ? "" : "s"} submitted:{" "}
                    {docs.map((d) => d.document_type).join(", ") || "—"}
                  </p>
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

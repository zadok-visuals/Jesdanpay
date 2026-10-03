import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill, statusTone } from "@/components/ui/Pill";
import { QueueFilters } from "@/components/admin/QueueFilters";
import { Pagination } from "@/components/admin/Pagination";
import { resolveUserIdsByEmail } from "@/lib/admin/search";
import { ADMIN_PAGE_SIZE, pageRange, parsePageParam, parseStringParam, type AdminSearchParams } from "@/lib/admin/pagination";
import { COUNTRIES } from "@/lib/countries";
import type { KycStatus } from "@/lib/types/database";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function countryName(code: string | null): string {
  if (!code) return "—";
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

function formatSignupDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// General user directory — every profile regardless of kyc_status, unlike admin/kyc which hard
// filters to "pending" (so a user disappears from that screen the moment they're approved). This
// is the only screen where "how many users do we actually have, in total" is answerable at all.
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const admin = createAdminClient();
  const params = await searchParams;
  const page = parsePageParam(params);
  const email = parseStringParam(params, "email");
  const from = parseStringParam(params, "from");
  const to = parseStringParam(params, "to");
  const status = parseStringParam(params, "status") ?? "all";

  const userIdsFilter = await resolveUserIdsByEmail(admin, email);
  if (email && (userIdsFilter?.length ?? 0) === 0) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold">Users</h1>
        <QueueFilters basePath="/admin/users" email={email} from={from} to={to} status={status} statusOptions={STATUS_OPTIONS} />
        <Card className="p-10 text-center text-sm text-foreground/50">No matching users.</Card>
      </div>
    );
  }

  let query = admin
    .from("profiles")
    .select("id, email, full_name, country, kyc_status, created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status !== "all") query = query.eq("kyc_status", status as KycStatus);
  if (userIdsFilter) query = query.in("id", userIdsFilter);
  if (from) query = query.gte("created_at", new Date(from).toISOString());
  if (to) query = query.lte("created_at", new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000).toISOString());

  const [fromRow, toRow] = pageRange(page);
  const { data: profiles, count } = await query.range(fromRow, toRow);

  // Unfiltered total — shown separately from the (possibly filtered) page count below so "how
  // many users do we have" is always answerable at a glance, regardless of the active filter.
  const { count: totalCount } = await admin.from("profiles").select("*", { count: "exact", head: true });

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="text-sm text-foreground/50">{totalCount ?? 0} total</p>
      </div>
      <QueueFilters basePath="/admin/users" email={email} from={from} to={to} status={status} statusOptions={STATUS_OPTIONS} />
      {!profiles || profiles.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">No users match these filters.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {profiles.map((profile) => (
            <Link key={profile.id} href={`/admin/users/${profile.id}`}>
              <Card className="flex flex-col gap-2 p-5 transition-colors hover:border-primary-300 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">{profile.full_name || profile.email}</span>
                  <span className="text-xs text-foreground/50">{profile.email}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-foreground/50 sm:gap-6">
                  <span>{countryName(profile.country)}</span>
                  <Pill tone={statusTone(profile.kyc_status)}>{profile.kyc_status}</Pill>
                  <span>Joined {formatSignupDate(profile.created_at)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Pagination page={page} pageSize={ADMIN_PAGE_SIZE} totalCount={count ?? 0} basePath="/admin/users" searchParams={params} />
    </div>
  );
}

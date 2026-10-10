import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill, statusTone } from "@/components/ui/Pill";
import { KycDocumentList } from "@/components/admin/KycDocumentList";
import { SuspendUserActions } from "@/components/admin/SuspendUserActions";
import { formatBalance } from "@/lib/currency";
import { COUNTRIES } from "@/lib/countries";
import { sumByCurrency } from "@/lib/admin/aggregate";
import { ledgerKindLabel } from "@/lib/admin/ledger";
import type { Currency } from "@/lib/types/database";

function countryName(code: string | null): string {
  if (!code) return "—";
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

function CurrencyTotals({ title, totals, empty }: { title: string; totals: Map<string, number>; empty: string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      {totals.size === 0 ? (
        <p className="text-xs text-foreground/50">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {[...totals.entries()].map(([currency, total]) => (
            <div key={currency} className="rounded-lg bg-black/[.03] px-3 py-2">
              <p className="text-xs text-foreground/50">{currency}</p>
              <p className="text-sm font-semibold">{formatBalance(currency as Currency, total)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select(
      "id, email, full_name, business_name, phone, country, kyc_type, kyc_status, kyc_rejection_reason, suspended_at, suspension_reason, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!profile) notFound();

  const [{ data: deposits }, { data: withdrawals }, { data: conversions }, { data: kycDocuments }, { data: recentActivity }] =
    await Promise.all([
      admin.from("deposits").select("currency, amount, confirmed_amount").eq("user_id", id).eq("status", "completed"),
      admin.from("transactions").select("currency, amount").eq("user_id", id).eq("type", "withdrawal").eq("status", "completed"),
      admin.from("cny_conversions").select("from_currency, from_amount").eq("user_id", id),
      admin.from("kyc_documents").select("*").eq("user_id", id),
      // Every deposit/transaction/conversion this user has ever made, across every currency and
      // type — the view migration 0044 introduced so an admin opening one user can actually see
      // everything they did, not just whichever queue happened to bring them here.
      admin.from("admin_activity_ledger").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    ]);

  const depositTotals = sumByCurrency(deposits ?? [], (d) => d.currency, (d) => d.confirmed_amount ?? d.amount);
  const withdrawalTotals = sumByCurrency(withdrawals ?? [], (w) => w.currency, (w) => w.amount);
  const conversionTotals = sumByCurrency(conversions ?? [], (c) => c.from_currency, (c) => c.from_amount);

  const fileRefs = (kycDocuments ?? []).map((d) => d.file_ref).filter((ref): ref is string => !!ref);
  const signedUrlByRef = new Map<string, string>();
  if (fileRefs.length) {
    const { data: signedUrls } = await admin.storage.from("kyc-documents").createSignedUrls(fileRefs, 3600);
    for (const entry of signedUrls ?? []) {
      if (entry.signedUrl) signedUrlByRef.set(entry.path ?? "", entry.signedUrl);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/users" className="text-sm text-primary-600 hover:underline">
          ← Back to Users
        </Link>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">{profile.full_name || profile.email}</h1>
            <Pill tone={statusTone(profile.kyc_status)}>{profile.kyc_status}</Pill>
            {profile.kyc_type && <Pill tone="neutral">{profile.kyc_type}</Pill>}
            {profile.suspended_at && <Pill tone="danger">suspended</Pill>}
          </div>
          <SuspendUserActions userId={profile.id} suspended={!!profile.suspended_at} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <p>
            <span className="text-foreground/50">Email:</span> {profile.email}
          </p>
          <p>
            <span className="text-foreground/50">Phone:</span> {profile.phone || "—"}
          </p>
          <p>
            <span className="text-foreground/50">Country:</span> {countryName(profile.country)}
          </p>
          <p>
            <span className="text-foreground/50">Joined:</span> {new Date(profile.created_at).toLocaleDateString()}
          </p>
          {profile.kyc_type === "business" && (
            <p>
              <span className="text-foreground/50">Business name:</span> {profile.business_name || "—"}
            </p>
          )}
          {profile.kyc_status === "rejected" && profile.kyc_rejection_reason && (
            <p className="sm:col-span-2">
              <span className="text-foreground/50">Rejection reason:</span> {profile.kyc_rejection_reason}
            </p>
          )}
          {profile.suspended_at && (
            <p className="sm:col-span-2">
              <span className="text-foreground/50">Suspended:</span>{" "}
              {new Date(profile.suspended_at).toLocaleString()}
              {profile.suspension_reason && ` — ${profile.suspension_reason}`}
            </p>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-6 p-6">
        <h2 className="text-base font-semibold">Transaction volume</h2>
        <CurrencyTotals title="Completed deposits" totals={depositTotals} empty="No completed deposits." />
        <CurrencyTotals title="Completed withdrawals" totals={withdrawalTotals} empty="No completed withdrawals." />
        <CurrencyTotals title="Conversions (by source currency)" totals={conversionTotals} empty="No conversions." />
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 text-base font-semibold">KYC documents</h2>
        <KycDocumentList docs={kycDocuments ?? []} signedUrlByRef={signedUrlByRef} />
      </Card>

      <Card className="overflow-hidden p-0">
        <h2 className="px-6 pt-5 pb-3 text-base font-semibold">Recent activity</h2>
        {!recentActivity || recentActivity.length === 0 ? (
          <p className="px-6 pb-5 text-sm text-foreground/50">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recentActivity.map((row) => (
              <li key={`${row.source}-${row.id}`} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground">{ledgerKindLabel(row.kind)}</span>
                  <span className="text-sm text-foreground/60">{formatBalance(row.currency, row.amount)}</span>
                  {row.target_currency && row.target_amount != null && (
                    <span className="text-xs text-foreground/40">→ {formatBalance(row.target_currency, row.target_amount)}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Pill tone={statusTone(row.status)}>{row.status}</Pill>
                  <span className="shrink-0 text-xs text-foreground/40">{new Date(row.created_at).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

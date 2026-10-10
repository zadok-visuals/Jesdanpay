import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill, statusTone } from "@/components/ui/Pill";
import { buttonClassName } from "@/components/ui/Button";
import { CopyButton } from "@/components/admin/CopyButton";
import { formatBalance } from "@/lib/currency";
import { RmbQueueActions } from "@/components/admin/RmbQueueActions";
import { QueueFilters } from "@/components/admin/QueueFilters";
import { Pagination } from "@/components/admin/Pagination";
import { resolveUserIdsByEmail } from "@/lib/admin/search";
import { pageRange, parsePageParam, parseStringParam, type AdminSearchParams } from "@/lib/admin/pagination";
import type { TransactionStatus } from "@/lib/types/database";

const PAYOUT_LABELS: Record<string, string> = {
  alipay: "Alipay",
  wechat: "WeChat Pay",
  bank: "Bank Account",
};

const STATUS_OPTIONS = [
  { value: "active", label: "Pending & processing" },
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

// Signed URLs are only ever opened by hand from the admin queue (not embedded anywhere
// long-lived), so a generous expiry just means fewer "link expired, reload the page" moments for
// an admin working through several requests in one sitting.
const SIGNED_URL_EXPIRY_SECONDS = 14400;

// A collapsed-by-default card per request (see the <details> below) is actually readable at this
// density — 25 (the shared admin default) was fine for a one-line-per-row list, not for a stack
// of cards an admin taps open one at a time.
const RMB_PAGE_SIZE = 10;

type Profile = { id: string; email: string; full_name: string | null; phone: string | null; country: string | null; kyc_status: string };

function plainNumber(n: number): string {
  return n.toFixed(2);
}

function cny(n: number): string {
  return `¥${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function dateHeading(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

// Compact details-grid field — small uppercase label, text-sm value, optional copy button.
function Field({
  label,
  value,
  copyValue,
  copyLabel,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  copyValue?: string | null;
  copyLabel?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-foreground/40">{label}</dt>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <dd className={`min-w-0 break-all text-sm font-medium text-foreground ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
        {copyValue && <CopyButton value={copyValue} label={copyLabel ?? label} />}
      </div>
    </div>
  );
}

// Counts pending+processing requests under the active email/date filters, but NOT the status
// filter itself — this is a workload overview, so it should read the same regardless of which
// status tab happens to be selected right now.
async function countByStatus(
  admin: ReturnType<typeof createAdminClient>,
  userIdsFilter: string[] | null,
  from: string | undefined,
  to: string | undefined,
  rmbStatus: TransactionStatus,
): Promise<number> {
  let query = admin
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("type", "rmb_manual")
    .eq("status", rmbStatus);
  if (userIdsFilter) query = query.in("user_id", userIdsFilter);
  if (from) query = query.gte("created_at", new Date(from).toISOString());
  if (to) query = query.lte("created_at", new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000).toISOString());
  const { count } = await query;
  return count ?? 0;
}

export default async function AdminRmbPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const admin = createAdminClient();
  const params = await searchParams;
  const page = parsePageParam(params);
  const email = parseStringParam(params, "email");
  const from = parseStringParam(params, "from");
  const to = parseStringParam(params, "to");
  const status = parseStringParam(params, "status") ?? "active";

  const userIdsFilter = await resolveUserIdsByEmail(admin, email);
  if (email && (userIdsFilter?.length ?? 0) === 0) {
    // No matching user — short-circuit to an empty result rather than an unfiltered query.
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold">CNY Payment Queue (Manual)</h1>
        <QueueFilters basePath="/admin/rmb" email={email} from={from} to={to} status={status} statusOptions={STATUS_OPTIONS} />
        <Card className="p-10 text-center text-sm text-foreground/50">No matching CNY payment requests.</Card>
      </div>
    );
  }

  let query = admin
    .from("transactions")
    .select("*", { count: "exact" })
    .eq("type", "rmb_manual")
    .order("created_at", { ascending: false });

  if (status === "active") query = query.in("status", ["pending", "processing"]);
  else if (status !== "all") query = query.eq("status", status as TransactionStatus);
  if (userIdsFilter) query = query.in("user_id", userIdsFilter);
  if (from) query = query.gte("created_at", new Date(from).toISOString());
  if (to) query = query.lte("created_at", new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000).toISOString());

  const [fromRow, toRow] = pageRange(page, RMB_PAGE_SIZE);
  const [{ data: rmbTransactions, count }, pendingCount, processingCount] = await Promise.all([
    query.range(fromRow, toRow),
    countByStatus(admin, userIdsFilter, from, to, "pending"),
    countByStatus(admin, userIdsFilter, from, to, "processing"),
  ]);

  const txIds = (rmbTransactions ?? []).map((t) => t.id);
  const userIds = [...new Set((rmbTransactions ?? []).map((t) => t.user_id))];

  const [{ data: recipients }, { data: profiles }] = await Promise.all([
    txIds.length ? admin.from("rmb_recipients").select("*").in("transaction_id", txIds) : Promise.resolve({ data: [] }),
    userIds.length
      ? admin.from("profiles").select("id, email, full_name, phone, country, kyc_status").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ]);
  const recipientByTx = new Map((recipients ?? []).map((r) => [r.transaction_id, r]));
  const profileByUser = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));

  const qrRefs = (recipients ?? []).map((r) => r.qr_code_ref).filter((ref): ref is string => !!ref);
  const proofRefs = (rmbTransactions ?? []).map((t) => t.payment_proof_ref).filter((ref): ref is string => !!ref);

  const [qrSigned, proofSigned] = await Promise.all([
    qrRefs.length
      ? admin.storage.from("rmb-recipient-qr").createSignedUrls(qrRefs, SIGNED_URL_EXPIRY_SECONDS)
      : Promise.resolve({ data: [] }),
    proofRefs.length
      ? admin.storage.from("rmb-payment-proof").createSignedUrls(proofRefs, SIGNED_URL_EXPIRY_SECONDS)
      : Promise.resolve({ data: [] }),
  ]);
  const qrSignedUrlByRef = new Map<string, string>();
  for (const entry of qrSigned.data ?? []) {
    if (entry.signedUrl) qrSignedUrlByRef.set(entry.path ?? "", entry.signedUrl);
  }
  const proofSignedUrlByRef = new Map<string, string>();
  for (const entry of proofSigned.data ?? []) {
    if (entry.signedUrl) proofSignedUrlByRef.set(entry.path ?? "", entry.signedUrl);
  }

  // Built as a flat list (not .map()) so a date heading can be inserted only when the heading
  // actually changes from the previous (already newest-first) row, without a stray "Today" /
  // "Yesterday" repeating above every single card.
  const rows: React.ReactNode[] = [];
  let lastHeading: string | null = null;
  for (const tx of rmbTransactions ?? []) {
    const heading = dateHeading(tx.created_at);
    if (heading !== lastHeading) {
      rows.push(
        <p key={`h-${tx.id}`} className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-foreground/40 first:mt-0">
          {heading}
        </p>,
      );
      lastHeading = heading;
    }

    const recipient = recipientByTx.get(tx.id);
    const profile = profileByUser.get(tx.user_id);
    const recipientFullName = recipient
      ? [recipient.recipient_first_name, recipient.recipient_last_name].filter(Boolean).join(" ")
      : "";
    const qrUrl = recipient?.qr_code_ref ? qrSignedUrlByRef.get(recipient.qr_code_ref) : undefined;
    const proofUrl = tx.payment_proof_ref ? proofSignedUrlByRef.get(tx.payment_proof_ref) : undefined;

    rows.push(
      <Card key={tx.id} className="overflow-hidden p-0">
        <details className="group">
          <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2.5 p-3 sm:gap-3 sm:p-4">
            <svg
              className="h-4 w-4 shrink-0 text-foreground/40 transition-transform group-open:rotate-180"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">{profile?.full_name || profile?.email || "—"}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {tx.target_amount != null ? (
                  <span className="truncate text-sm font-semibold text-foreground">
                    {formatBalance(tx.currency, tx.amount)} to {cny(tx.target_amount)}
                  </span>
                ) : (
                  <>
                    <span className="truncate text-sm font-semibold text-foreground">{formatBalance(tx.currency, tx.amount)}</span>
                    <span className="text-xs text-foreground/40">CNY not recorded (older request)</span>
                  </>
                )}
                <Pill tone={statusTone(tx.status)}>{tx.status}</Pill>
              </div>
              <span className="truncate text-xs text-foreground/50">
                {recipient ? PAYOUT_LABELS[recipient.payout_method] : "—"} ·{" "}
                {new Date(tx.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          </summary>

          <div className="flex min-w-0 flex-col gap-3 border-t border-border p-3 sm:gap-4 sm:p-4">
            {/* "Pay this" — everything the admin pastes into the external provider, together. */}
            <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-primary-200 bg-primary-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary-700">Pay this</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {tx.target_amount != null ? (
                  <>
                    <span className="text-lg font-bold text-primary-900">Deliver {cny(tx.target_amount)}</span>
                    <CopyButton value={plainNumber(tx.target_amount)} label="CNY amount to deliver" />
                  </>
                ) : (
                  <span className="text-sm font-medium text-foreground/40">CNY not recorded (older request)</span>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 md:grid-cols-4">
                <Field label="Recipient" value={recipientFullName || "—"} copyValue={recipientFullName || undefined} copyLabel="recipient name" />
                <Field label="Payout method" value={recipient ? PAYOUT_LABELS[recipient.payout_method] : "—"} />

                {recipient && (recipient.payout_method === "alipay" || recipient.payout_method === "wechat") && (
                  <Field
                    label={recipient.payout_method === "alipay" ? "Alipay ID" : "WeChat ID"}
                    value={
                      (recipient.payout_method === "alipay" ? recipient.recipient_alipay_id : recipient.recipient_wechat_id) ||
                      (recipient.qr_code_ref ? "QR code only" : "—")
                    }
                    copyValue={recipient.payout_method === "alipay" ? recipient.recipient_alipay_id : recipient.recipient_wechat_id}
                  />
                )}

                {recipient && recipient.payout_method === "bank" && (
                  <>
                    <Field label="Bank name" value={recipient.recipient_bank_name || "—"} copyValue={recipient.recipient_bank_name} />
                    <Field
                      label="Account number"
                      value={recipient.recipient_bank_account_number || "—"}
                      copyValue={recipient.recipient_bank_account_number}
                    />
                    <Field
                      label="Account holder"
                      value={recipient.recipient_account_holder_name || "—"}
                      copyValue={recipient.recipient_account_holder_name}
                    />
                  </>
                )}
              </dl>

              {recipient?.qr_code_ref && qrUrl && (
                <div className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-border bg-white p-2.5 sm:flex-row sm:items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a signed, expiring URL isn't a candidate for next/image's static optimization */}
                  <img src={qrUrl} alt="Recipient QR code" className="h-24 w-24 shrink-0 rounded-lg border border-border object-contain" />
                  <div className="flex flex-wrap gap-2">
                    <a href={qrUrl} target="_blank" rel="noopener noreferrer" className={buttonClassName("secondary", "sm")}>
                      Open full size
                    </a>
                    <a href={qrUrl} download className={buttonClassName("secondary", "sm")}>
                      Download
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Compact details grid — everything else, tight and label-first. */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
              <Field label="Customer" value={profile?.full_name || "—"} copyValue={profile?.full_name} copyLabel="customer name" />
              <Field
                label="Email"
                value={
                  profile?.email ? (
                    <Link href={`/admin/users/${tx.user_id}`} className="text-primary-600 hover:underline">
                      {profile.email}
                    </Link>
                  ) : (
                    "—"
                  )
                }
                copyValue={profile?.email}
              />
              <Field label="Phone" value={profile?.phone || "—"} copyValue={profile?.phone} />
              <Field label="Country" value={profile?.country || "—"} />
              <Field
                label="KYC status"
                value={<Pill tone={statusTone(profile?.kyc_status ?? "")}>{profile?.kyc_status ?? "—"}</Pill>}
              />
              <Field label="Amount debited" value={formatBalance(tx.currency, tx.amount)} />
              <Field label="Created" value={new Date(tx.created_at).toLocaleString()} />
              <Field label="Transaction ID" value={tx.id} copyValue={tx.id} copyLabel="full transaction ID" mono />
            </dl>

            {tx.status === "failed" && tx.rejection_reason && (
              <div className="min-w-0 break-words rounded-xl bg-danger-50 p-2.5 text-sm text-danger-700">
                <span className="font-medium">Rejection reason: </span>
                {tx.rejection_reason}
              </div>
            )}

            {tx.status === "completed" && (
              <div className="flex min-w-0 flex-col gap-1 break-words rounded-xl bg-success-50 p-2.5 text-sm text-foreground/80">
                {tx.actual_target_amount != null && (
                  <p>
                    Delivered: <strong className="font-semibold text-foreground">{cny(tx.actual_target_amount)}</strong>
                  </p>
                )}
                {tx.actual_rate_note && <p>Note: {tx.actual_rate_note}</p>}
                {proofUrl && (
                  <p>
                    <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline">
                      View payment proof
                    </a>
                  </p>
                )}
              </div>
            )}

            <div className="flex w-full min-w-0 flex-col border-t border-border pt-3">
              <RmbQueueActions transactionId={tx.id} status={tx.status} defaultTargetAmount={tx.target_amount} />
            </div>
          </div>
        </details>
      </Card>,
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">CNY Payment Queue (Manual)</h1>
      <p className="mb-4 text-sm text-foreground/60">
        <strong className="font-semibold text-foreground">{pendingCount}</strong> pending ·{" "}
        <strong className="font-semibold text-foreground">{processingCount}</strong> processing
      </p>
      <QueueFilters basePath="/admin/rmb" email={email} from={from} to={to} status={status} statusOptions={STATUS_OPTIONS} />
      {!rmbTransactions || rmbTransactions.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">No CNY payment requests match these filters.</Card>
      ) : (
        <div className="flex flex-col gap-2">{rows}</div>
      )}
      <div className="mt-4">
        <Pagination page={page} pageSize={RMB_PAGE_SIZE} totalCount={count ?? 0} basePath="/admin/rmb" searchParams={params} />
      </div>
    </div>
  );
}

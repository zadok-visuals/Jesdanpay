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
import { ADMIN_PAGE_SIZE, pageRange, parsePageParam, parseStringParam, type AdminSearchParams } from "@/lib/admin/pagination";
import type { RmbRecipient, Transaction, TransactionStatus } from "@/lib/types/database";

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

type Profile = { id: string; email: string; full_name: string | null; phone: string | null; country: string | null; kyc_status: string };

function plainNumber(n: number): string {
  return n.toFixed(2);
}

// One clean plain-text block the admin pastes into an external provider to actually action the
// payment — built server-side so the copy button never has to re-derive formatting client-side.
function buildCopyAllText(
  tx: Pick<Transaction, "id" | "target_amount">,
  recipient: RmbRecipient | undefined,
  profile: Profile | undefined,
): string {
  const lines: string[] = [];

  if (recipient) {
    lines.push(`Payout method: ${PAYOUT_LABELS[recipient.payout_method] ?? recipient.payout_method}`);

    if (recipient.payout_method === "alipay" || recipient.payout_method === "wechat") {
      const fullName = [recipient.recipient_first_name, recipient.recipient_last_name].filter(Boolean).join(" ");
      if (fullName) lines.push(`Recipient name: ${fullName}`);
      if (recipient.payout_method === "alipay" && recipient.recipient_alipay_id) {
        lines.push(`Alipay ID: ${recipient.recipient_alipay_id}`);
      }
      if (recipient.payout_method === "wechat" && recipient.recipient_wechat_id) {
        lines.push(`WeChat ID: ${recipient.recipient_wechat_id}`);
      }
    } else {
      if (recipient.recipient_bank_name) lines.push(`Bank name: ${recipient.recipient_bank_name}`);
      if (recipient.recipient_bank_account_number) lines.push(`Account number: ${recipient.recipient_bank_account_number}`);
      if (recipient.recipient_account_holder_name) lines.push(`Account holder: ${recipient.recipient_account_holder_name}`);
    }
  }

  if (tx.target_amount != null) lines.push(`Amount to deliver (CNY): ${plainNumber(tx.target_amount)}`);
  lines.push(`Reference: ${tx.id}`);
  if (profile) lines.push(`Customer: ${profile.full_name || profile.email} (${profile.email})`);

  return lines.join("\n");
}

function Field({
  label,
  value,
  copyValue,
  copyLabel,
}: {
  label: string;
  value: React.ReactNode;
  copyValue?: string | null;
  copyLabel?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-foreground/40">{label}</dt>
      <div className="flex flex-wrap items-center gap-2">
        <dd className="min-w-0 break-all text-sm font-medium text-foreground">{value}</dd>
        {copyValue && <CopyButton value={copyValue} label={copyLabel ?? label} />}
      </div>
    </div>
  );
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

  const [fromRow, toRow] = pageRange(page);
  const { data: rmbTransactions, count } = await query.range(fromRow, toRow);

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

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">CNY Payment Queue (Manual)</h1>
      <QueueFilters basePath="/admin/rmb" email={email} from={from} to={to} status={status} statusOptions={STATUS_OPTIONS} />
      {!rmbTransactions || rmbTransactions.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">No CNY payment requests match these filters.</Card>
      ) : (
        <div className="flex flex-col gap-4">
          {rmbTransactions.map((tx) => {
            const recipient = recipientByTx.get(tx.id);
            const profile = profileByUser.get(tx.user_id);
            const recipientFullName = recipient
              ? [recipient.recipient_first_name, recipient.recipient_last_name].filter(Boolean).join(" ")
              : "";
            const qrUrl = recipient?.qr_code_ref ? qrSignedUrlByRef.get(recipient.qr_code_ref) : undefined;
            const proofUrl = tx.payment_proof_ref ? proofSignedUrlByRef.get(tx.payment_proof_ref) : undefined;
            const copyAllText = buildCopyAllText(tx, recipient, profile);

            return (
              <Card key={tx.id} className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">{formatBalance(tx.currency, tx.amount)}</span>
                    <Pill tone={statusTone(tx.status)}>{tx.status}</Pill>
                  </div>
                  <span className="text-xs text-foreground/40">{new Date(tx.created_at).toLocaleString()}</span>
                </div>

                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                  <Field label="Customer" value={profile?.full_name || "—"} copyValue={profile?.full_name} copyLabel="customer name" />
                  <Field label="Email" value={profile?.email || "—"} copyValue={profile?.email} />
                  <Field label="Phone" value={profile?.phone || "—"} copyValue={profile?.phone} />
                  <Field label="Country" value={profile?.country || "—"} />
                  <Field
                    label="KYC status"
                    value={<Pill tone={statusTone(profile?.kyc_status ?? "")}>{profile?.kyc_status ?? "—"}</Pill>}
                  />
                  <Field
                    label="Transaction ID"
                    value={<span title={tx.id}>{tx.id.slice(0, 8)}…</span>}
                    copyValue={tx.id}
                    copyLabel="full transaction ID"
                  />
                  <Field
                    label="Amount debited"
                    value={formatBalance(tx.currency, tx.amount)}
                    copyValue={plainNumber(tx.amount)}
                    copyLabel="amount debited"
                  />
                  {tx.target_amount != null && (
                    <Field
                      label="Quoted CNY amount"
                      value={`¥${tx.target_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                      copyValue={plainNumber(tx.target_amount)}
                      copyLabel="quoted CNY amount"
                    />
                  )}
                  <Field label="Payout method" value={recipient ? PAYOUT_LABELS[recipient.payout_method] : "—"} />

                  {recipient && (recipient.payout_method === "alipay" || recipient.payout_method === "wechat") && (
                    <>
                      <Field
                        label="Recipient first name"
                        value={recipient.recipient_first_name || "—"}
                        copyValue={recipient.recipient_first_name}
                      />
                      <Field
                        label="Recipient last name"
                        value={recipient.recipient_last_name || "—"}
                        copyValue={recipient.recipient_last_name}
                      />
                      <Field label="Recipient full name" value={recipientFullName || "—"} copyValue={recipientFullName || undefined} />
                      <Field
                        label={recipient.payout_method === "alipay" ? "Alipay ID" : "WeChat ID"}
                        value={
                          (recipient.payout_method === "alipay" ? recipient.recipient_alipay_id : recipient.recipient_wechat_id) ||
                          (recipient.qr_code_ref ? "QR code only" : "—")
                        }
                        copyValue={recipient.payout_method === "alipay" ? recipient.recipient_alipay_id : recipient.recipient_wechat_id}
                      />
                    </>
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
                  <div className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a signed, expiring URL isn't a candidate for next/image's static optimization */}
                    <img src={qrUrl} alt="Recipient QR code" className="h-28 w-28 shrink-0 rounded-lg border border-border object-contain" />
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

                {tx.status === "failed" && tx.rejection_reason && (
                  <div className="rounded-xl bg-danger-50 p-3 text-sm text-danger-700">
                    <span className="font-medium">Rejection reason: </span>
                    {tx.rejection_reason}
                  </div>
                )}

                {tx.status === "completed" && (
                  <div className="flex flex-col gap-1 rounded-xl bg-success-50 p-3 text-sm text-foreground/80">
                    {tx.actual_target_amount != null && (
                      <p>
                        Delivered:{" "}
                        <strong className="font-semibold text-foreground">
                          ¥{tx.actual_target_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </strong>
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

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <CopyButton value={copyAllText} variant="block">
                    Copy all details
                  </CopyButton>
                  <RmbQueueActions transactionId={tx.id} status={tx.status} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Pagination page={page} pageSize={ADMIN_PAGE_SIZE} totalCount={count ?? 0} basePath="/admin/rmb" searchParams={params} />
    </div>
  );
}

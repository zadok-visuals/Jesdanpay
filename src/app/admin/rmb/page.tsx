import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill, statusTone } from "@/components/ui/Pill";
import { formatBalance } from "@/lib/currency";
import { RmbQueueActions } from "@/components/admin/RmbQueueActions";
import { QueueFilters } from "@/components/admin/QueueFilters";
import { Pagination } from "@/components/admin/Pagination";
import { resolveUserIdsByEmail } from "@/lib/admin/search";
import { ADMIN_PAGE_SIZE, pageRange, parsePageParam, parseStringParam, type AdminSearchParams } from "@/lib/admin/pagination";
import { summarizeRmbRecipient } from "@/lib/rmbRecipient";
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
        <h1 className="mb-6 text-xl font-semibold">CNY Exchange Queue (Manual)</h1>
        <QueueFilters basePath="/admin/rmb" email={email} from={from} to={to} status={status} statusOptions={STATUS_OPTIONS} />
        <Card className="p-10 text-center text-sm text-foreground/50">No matching CNY exchange requests.</Card>
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
    userIds.length ? admin.from("profiles").select("id, email, full_name").in("id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const recipientByTx = new Map((recipients ?? []).map((r) => [r.transaction_id, r]));
  const profileByUser = new Map((profiles ?? []).map((p) => [p.id, p]));

  const qrRefs = (recipients ?? []).map((r) => r.qr_code_ref).filter((ref): ref is string => !!ref);
  const qrSignedUrlByRef = new Map<string, string>();
  if (qrRefs.length) {
    const { data: signedUrls } = await admin.storage.from("rmb-recipient-qr").createSignedUrls(qrRefs, 3600);
    for (const entry of signedUrls ?? []) {
      if (entry.signedUrl) qrSignedUrlByRef.set(entry.path ?? "", entry.signedUrl);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">CNY Exchange Queue (Manual)</h1>
      <QueueFilters basePath="/admin/rmb" email={email} from={from} to={to} status={status} statusOptions={STATUS_OPTIONS} />
      {!rmbTransactions || rmbTransactions.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">No CNY exchange requests match these filters.</Card>
      ) : (
        <div className="flex flex-col gap-4">
          {rmbTransactions.map((tx) => {
            const recipient = recipientByTx.get(tx.id);
            const profile = profileByUser.get(tx.user_id);

            return (
              <Card key={tx.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{formatBalance(tx.currency, tx.amount)}</span>
                    <Pill tone={statusTone(tx.status)}>{tx.status}</Pill>
                  </div>
                  <p className="text-sm text-foreground/60">{profile?.full_name || profile?.email || tx.user_id}</p>
                  <p className="text-xs text-foreground/50">
                    {recipient ? PAYOUT_LABELS[recipient.payout_method] : "—"} ·{" "}
                    {recipient ? summarizeRmbRecipient(recipient) : "—"}
                    {recipient?.qr_code_ref && qrSignedUrlByRef.has(recipient.qr_code_ref) && (
                      <>
                        {" · "}
                        <a
                          href={qrSignedUrlByRef.get(recipient.qr_code_ref)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary-600 hover:underline"
                        >
                          View QR code
                        </a>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-foreground/40">{new Date(tx.created_at).toLocaleString()}</p>
                  {tx.status === "completed" && tx.actual_target_amount != null && (
                    <p className="mt-1 text-xs text-foreground/60">
                      Delivered{" "}
                      <strong className="font-semibold text-foreground">
                        ¥{tx.actual_target_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </strong>
                      {tx.actual_rate_note && ` · ${tx.actual_rate_note}`}
                    </p>
                  )}
                </div>

                <RmbQueueActions transactionId={tx.id} status={tx.status} />
              </Card>
            );
          })}
        </div>
      )}
      <Pagination page={page} pageSize={ADMIN_PAGE_SIZE} totalCount={count ?? 0} basePath="/admin/rmb" searchParams={params} />
    </div>
  );
}

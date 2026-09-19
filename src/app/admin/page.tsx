import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill, statusTone } from "@/components/ui/Pill";
import { formatBalance } from "@/lib/currency";
import { RmbQueueActions } from "@/components/admin/RmbQueueActions";
import { KycQueueActions } from "@/components/admin/KycQueueActions";

const PAYOUT_LABELS: Record<string, string> = {
  alipay: "Alipay",
  wechat: "WeChat Pay",
  bank: "Bank Account",
};

export default async function AdminPage() {
  const admin = createAdminClient();

  const [{ data: rmbTransactions }, { data: klashaTransactions }, { data: pendingProfiles }] =
    await Promise.all([
      admin.from("transactions").select("*").eq("type", "rmb_manual").order("created_at", { ascending: false }),
      admin
        .from("transactions")
        .select("*")
        .eq("type", "rmb_auto")
        .eq("provider", "klasha")
        .order("created_at", { ascending: false }),
      admin.from("profiles").select("id, email, full_name, kyc_type").eq("kyc_status", "pending"),
    ]);

  const allTxIds = [...(rmbTransactions ?? []), ...(klashaTransactions ?? [])].map((t) => t.id);
  const allUserIds = [
    ...new Set(
      [...(rmbTransactions ?? []), ...(klashaTransactions ?? [])].map((t) => t.user_id),
    ),
  ];
  const kycUserIds = (pendingProfiles ?? []).map((p) => p.id);

  const [{ data: recipients }, { data: profiles }, { data: kycDocuments }] = await Promise.all([
    allTxIds.length
      ? admin.from("rmb_recipients").select("*").in("transaction_id", allTxIds)
      : Promise.resolve({ data: [] }),
    allUserIds.length
      ? admin.from("profiles").select("id, email, full_name").in("id", allUserIds)
      : Promise.resolve({ data: [] }),
    kycUserIds.length
      ? admin.from("kyc_documents").select("*").in("user_id", kycUserIds).eq("status", "pending")
      : Promise.resolve({ data: [] }),
  ]);

  const recipientByTx = new Map((recipients ?? []).map((r) => [r.transaction_id, r]));
  const profileByUser = new Map((profiles ?? []).map((p) => [p.id, p]));
  const documentsByUser = new Map<string, typeof kycDocuments>();
  for (const doc of kycDocuments ?? []) {
    documentsByUser.set(doc.user_id, [...(documentsByUser.get(doc.user_id) ?? []), doc]);
  }

  function recipientSummary(recipient: NonNullable<ReturnType<typeof recipientByTx.get>>) {
    return recipient.payout_method === "alipay"
      ? recipient.recipient_alipay_id
      : recipient.payout_method === "wechat"
        ? recipient.recipient_wechat_id
        : `${recipient.recipient_bank_name} · ${recipient.recipient_bank_account_number} · ${recipient.recipient_account_holder_name}`;
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="mb-6 text-xl font-semibold">KYC Review</h1>
        {!pendingProfiles || pendingProfiles.length === 0 ? (
          <Card className="p-10 text-center text-sm text-foreground/50">
            No pending KYC submissions.
          </Card>
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
      </section>

      <section>
        <h1 className="mb-6 text-xl font-semibold">Klasha CNY Queue</h1>
        {!klashaTransactions || klashaTransactions.length === 0 ? (
          <Card className="p-10 text-center text-sm text-foreground/50">
            No Klasha settlements yet.
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {klashaTransactions.map((tx) => {
              const recipient = recipientByTx.get(tx.id);
              const profile = profileByUser.get(tx.user_id);
              return (
                <Card key={tx.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{formatBalance(tx.currency, tx.amount)}</span>
                      <span className="text-xs text-foreground/40">→ ¥{tx.target_amount}</span>
                      <Pill tone={statusTone(tx.status)}>{tx.status}</Pill>
                    </div>
                    <p className="text-sm text-foreground/60">
                      {profile?.full_name || profile?.email || tx.user_id}
                    </p>
                    <p className="text-xs text-foreground/50">
                      {recipient ? recipientSummary(recipient) : "—"}
                    </p>
                    <p className="text-xs text-foreground/40">{new Date(tx.created_at).toLocaleString()}</p>
                    {tx.status === "failed" && (
                      <p className="text-xs text-danger-500">
                        Payout failed or is stuck pending — check Klasha's dashboard for this
                        request and settle manually if needed.
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h1 className="mb-6 text-xl font-semibold">RMB Exchange Queue (Manual)</h1>
        {!rmbTransactions || rmbTransactions.length === 0 ? (
          <Card className="p-10 text-center text-sm text-foreground/50">
            No RMB exchange requests yet.
          </Card>
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
                    <p className="text-sm text-foreground/60">
                      {profile?.full_name || profile?.email || tx.user_id}
                    </p>
                    <p className="text-xs text-foreground/50">
                      {recipient ? PAYOUT_LABELS[recipient.payout_method] : "—"} ·{" "}
                      {recipient ? recipientSummary(recipient) : "—"}
                    </p>
                    <p className="text-xs text-foreground/40">
                      {new Date(tx.created_at).toLocaleString()}
                    </p>
                    {tx.status === "completed" && tx.actual_target_amount != null && (
                      <p className="mt-1 text-xs text-foreground/60">
                        Delivered <strong className="font-semibold text-foreground">
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
      </section>
    </div>
  );
}

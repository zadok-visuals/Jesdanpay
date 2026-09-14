import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill, statusTone } from "@/components/ui/Pill";
import { formatBalance } from "@/lib/currency";
import { RmbQueueActions } from "@/components/admin/RmbQueueActions";

const PAYOUT_LABELS: Record<string, string> = {
  alipay: "Alipay",
  wechat: "WeChat Pay",
  bank: "Bank Account",
};

export default async function AdminRmbQueuePage() {
  const admin = createAdminClient();

  const { data: transactions } = await admin
    .from("transactions")
    .select("*")
    .eq("type", "rmb_manual")
    .order("created_at", { ascending: false });

  const txIds = (transactions ?? []).map((t) => t.id);
  const userIds = [...new Set((transactions ?? []).map((t) => t.user_id))];

  const [{ data: recipients }, { data: profiles }] = await Promise.all([
    txIds.length
      ? admin.from("rmb_recipients").select("*").in("transaction_id", txIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? admin.from("profiles").select("id, email, full_name").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ]);

  const recipientByTx = new Map((recipients ?? []).map((r) => [r.transaction_id, r]));
  const profileByUser = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">RMB Exchange Queue</h1>

      {!transactions || transactions.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">
          No RMB exchange requests yet.
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {transactions.map((tx) => {
            const recipient = recipientByTx.get(tx.id);
            const profile = profileByUser.get(tx.user_id);
            const recipientSummary = recipient
              ? recipient.payout_method === "alipay"
                ? recipient.recipient_alipay_id
                : recipient.payout_method === "wechat"
                  ? recipient.recipient_wechat_id
                  : `${recipient.recipient_bank_name} · ${recipient.recipient_bank_account_number} · ${recipient.recipient_account_holder_name}`
              : "—";

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
                    {recipient ? PAYOUT_LABELS[recipient.payout_method] : "—"} · {recipientSummary}
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
    </div>
  );
}

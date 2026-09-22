import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill, statusTone } from "@/components/ui/Pill";
import { formatBalance } from "@/lib/currency";
import { RmbQueueActions } from "@/components/admin/RmbQueueActions";
import { KycQueueActions } from "@/components/admin/KycQueueActions";
import { FxRateForm } from "@/components/admin/FxRateForm";
import { WithdrawalQueueActions } from "@/components/admin/WithdrawalQueueActions";
import type { Currency } from "@/lib/types/database";

const FX_SOURCE_CURRENCIES: Currency[] = ["NGN", "GHS", "KES", "USDT"];

const PAYOUT_LABELS: Record<string, string> = {
  alipay: "Alipay",
  wechat: "WeChat Pay",
  bank: "Bank Account",
};

export default async function AdminPage() {
  const admin = createAdminClient();

  const [{ data: rmbTransactions }, { data: pendingProfiles }, { data: fxRates }, { data: withdrawalTransactions }] =
    await Promise.all([
      admin.from("transactions").select("*").eq("type", "rmb_manual").order("created_at", { ascending: false }),
      admin.from("profiles").select("id, email, full_name, kyc_type").eq("kyc_status", "pending"),
      admin.from("admin_fx_rates").select("*"),
      admin.from("transactions").select("*").eq("type", "withdrawal").order("created_at", { ascending: false }),
    ]);
  const fxRateByCurrency = new Map((fxRates ?? []).map((r) => [r.source_currency, r.cny_rate]));

  const txIds = (rmbTransactions ?? []).map((t) => t.id);
  const userIds = [...new Set((rmbTransactions ?? []).map((t) => t.user_id))];
  const kycUserIds = (pendingProfiles ?? []).map((p) => p.id);
  const withdrawalUserIds = [...new Set((withdrawalTransactions ?? []).map((t) => t.user_id))];

  const [{ data: recipients }, { data: profiles }, { data: kycDocuments }, { data: withdrawalRecipients }, { data: withdrawalProfiles }] =
    await Promise.all([
      txIds.length
        ? admin.from("rmb_recipients").select("*").in("transaction_id", txIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? admin.from("profiles").select("id, email, full_name").in("id", userIds)
        : Promise.resolve({ data: [] }),
      kycUserIds.length
        ? admin.from("kyc_documents").select("*").in("user_id", kycUserIds).eq("status", "pending")
        : Promise.resolve({ data: [] }),
      withdrawalUserIds.length
        ? admin.from("withdrawal_recipients").select("*").in("user_id", withdrawalUserIds)
        : Promise.resolve({ data: [] }),
      withdrawalUserIds.length
        ? admin.from("profiles").select("id, email, full_name").in("id", withdrawalUserIds)
        : Promise.resolve({ data: [] }),
    ]);
  const withdrawalRecipientByUser = new Map((withdrawalRecipients ?? []).map((r) => [r.user_id, r]));
  const withdrawalProfileByUser = new Map((withdrawalProfiles ?? []).map((p) => [p.id, p]));

  const recipientByTx = new Map((recipients ?? []).map((r) => [r.transaction_id, r]));
  const profileByUser = new Map((profiles ?? []).map((p) => [p.id, p]));

  // Signed URLs so admin can view an uploaded recipient QR code without the bucket being public.
  const qrRefs = (recipients ?? []).map((r) => r.qr_code_ref).filter((ref): ref is string => !!ref);
  const qrSignedUrlByRef = new Map<string, string>();
  if (qrRefs.length) {
    const { data: signedUrls } = await admin.storage
      .from("rmb-recipient-qr")
      .createSignedUrls(qrRefs, 3600);
    for (const entry of signedUrls ?? []) {
      if (entry.signedUrl) qrSignedUrlByRef.set(entry.path ?? "", entry.signedUrl);
    }
  }
  const documentsByUser = new Map<string, typeof kycDocuments>();
  for (const doc of kycDocuments ?? []) {
    documentsByUser.set(doc.user_id, [...(documentsByUser.get(doc.user_id) ?? []), doc]);
  }

  function recipientSummary(recipient: NonNullable<ReturnType<typeof recipientByTx.get>>) {
    if (recipient.payout_method === "alipay" || recipient.payout_method === "wechat") {
      const id = recipient.payout_method === "alipay" ? recipient.recipient_alipay_id : recipient.recipient_wechat_id;
      return id || (recipient.qr_code_ref ? "QR code uploaded (see link below)" : "—");
    }
    return `${recipient.recipient_bank_name} · ${recipient.recipient_bank_account_number} · ${recipient.recipient_account_holder_name}`;
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="mb-6 text-xl font-semibold">CNY Conversion Rates</h1>
        <Card className="flex flex-col gap-4 p-5">
          <p className="text-xs text-foreground/50">
            The rate users convert against when locking a CNY balance (before the margin is
            applied). Update these regularly — conversion is blocked for a currency until a rate
            is set here.
          </p>
          <div className="flex flex-wrap gap-6">
            {FX_SOURCE_CURRENCIES.map((currency) => (
              <FxRateForm key={currency} currency={currency} cnyRate={fxRateByCurrency.get(currency) ?? null} />
            ))}
          </div>
        </Card>
      </section>

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

      <section>
        <h1 className="mb-6 text-xl font-semibold">Withdrawal Requests</h1>
        {!withdrawalTransactions || withdrawalTransactions.length === 0 ? (
          <Card className="p-10 text-center text-sm text-foreground/50">
            No withdrawal requests yet.
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {withdrawalTransactions.map((tx) => {
              const recipient = withdrawalRecipientByUser.get(tx.user_id);
              const profile = withdrawalProfileByUser.get(tx.user_id);

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
                      {recipient
                        ? recipient.wallet_address
                          ? `USDT · ${recipient.wallet_address}`
                          : `${recipient.bank_name} · ${recipient.bank_account_number} · ${recipient.account_holder_name}`
                        : "—"}
                    </p>
                    {tx.target_amount != null && (
                      <p className="text-xs text-foreground/50">
                        Net payout: <strong className="font-semibold text-foreground">
                          {formatBalance(tx.currency, tx.target_amount)}
                        </strong>{" "}
                        (after 1% fee)
                      </p>
                    )}
                    <p className="text-xs text-foreground/40">
                      {new Date(tx.created_at).toLocaleString()}
                    </p>
                  </div>

                  <WithdrawalQueueActions transactionId={tx.id} status={tx.status} />
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill, statusTone } from "@/components/ui/Pill";
import { formatBalance } from "@/lib/currency";
import type { Currency } from "@/lib/types/database";
import { RmbQueueActions } from "@/components/admin/RmbQueueActions";
import { KycQueueActions } from "@/components/admin/KycQueueActions";
import { CnyTierRateForm } from "@/components/admin/CnyTierRateForm";
import { CnyMarkupForm } from "@/components/admin/CnyMarkupForm";
import { WithdrawalQueueActions } from "@/components/admin/WithdrawalQueueActions";
import { summarizeRmbRecipient } from "@/lib/rmbRecipient";

const MARKUP_RANGE_OPTIONS = [7, 30, 90, 0] as const; // 0 = all time

const PAYOUT_LABELS: Record<string, string> = {
  alipay: "Alipay",
  wechat: "WeChat Pay",
  bank: "Bank Account",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const admin = createAdminClient();
  const params = await searchParams;
  const rangeDaysParam = Number(Array.isArray(params.markupDays) ? params.markupDays[0] : params.markupDays);
  const rangeDays = MARKUP_RANGE_OPTIONS.includes(rangeDaysParam as (typeof MARKUP_RANGE_OPTIONS)[number])
    ? rangeDaysParam
    : 30;
  const rangeCutoff = rangeDays > 0 ? new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString() : null;

  const [
    { data: rmbTransactions },
    { data: pendingProfiles },
    { data: tierRates },
    { data: markupRow },
    { data: withdrawalTransactions },
    { data: cnyConversionsForMarkup },
    { data: swapsForMarkup },
  ] = await Promise.all([
    admin.from("transactions").select("*").eq("type", "rmb_manual").order("created_at", { ascending: false }),
    admin.from("profiles").select("id, email, full_name, kyc_type").eq("kyc_status", "pending"),
    admin.from("cny_tier_rates").select("*").order("tier_min_cny"),
    admin.from("cny_markup_rate").select("*").single(),
    admin.from("transactions").select("*").eq("type", "withdrawal").order("created_at", { ascending: false }),
    (() => {
      let q = admin.from("cny_conversions").select("to_currency, to_amount, margin_rate, created_at");
      if (rangeCutoff) q = q.gte("created_at", rangeCutoff);
      return q;
    })(),
    (() => {
      let q = admin
        .from("transactions")
        .select("target_currency, target_amount, raw_target_amount, created_at")
        .eq("provider", "busha")
        .eq("type", "usdt_ngn")
        .not("raw_target_amount", "is", null);
      if (rangeCutoff) q = q.gte("created_at", rangeCutoff);
      return q;
    })(),
  ]);

  // Markup collected, by currency — cny_conversions already stores enough (to_amount and
  // margin_rate) to back out the pre-margin amount; swap transactions only have this since
  // migration 0025 added raw_target_amount, so older swap rows are excluded (they were never
  // charged a different rate, but the raw figure to compute the delta from no longer exists).
  const markupByCurrency = new Map<Currency, { cny: number; swap: number }>();
  function addMarkup(currency: Currency, key: "cny" | "swap", amount: number) {
    const entry = markupByCurrency.get(currency) ?? { cny: 0, swap: 0 };
    entry[key] += amount;
    markupByCurrency.set(currency, entry);
  }
  for (const row of cnyConversionsForMarkup ?? []) {
    if (row.margin_rate <= 0 || row.margin_rate >= 1) continue;
    const preMargin = row.to_amount / (1 - row.margin_rate);
    addMarkup(row.to_currency, "cny", preMargin - row.to_amount);
  }
  for (const row of swapsForMarkup ?? []) {
    if (row.target_currency == null || row.target_amount == null || row.raw_target_amount == null) continue;
    addMarkup(row.target_currency, "swap", row.raw_target_amount - row.target_amount);
  }

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
    return summarizeRmbRecipient(recipient);
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="mb-6 text-xl font-semibold">CNY Conversion Rates</h1>
        <Card className="flex flex-col gap-4 p-5">
          <p className="text-xs text-foreground/50">
            The USDT/CNY leg of the rate users convert against (before the margin is applied).
            Layered on top of Busha's live fiat/USDT rate to derive the fiat→CNY rate shown to
            users. Update as market conditions change.
          </p>
          <div className="flex flex-wrap gap-6">
            {(tierRates ?? []).map((tier) => (
              <CnyTierRateForm
                key={tier.tier_min_cny}
                tierMin={tier.tier_min_cny}
                tierMax={tier.tier_max_cny}
                usdtToCnyRate={tier.usdt_to_cny_rate}
              />
            ))}
          </div>
          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs text-foreground/50">
              Applied on top of the tiered rate above before it's shown to any user — the single
              markup Convert CNY and Pay to China both use, so they can never quote differently.
            </p>
            <CnyMarkupForm markupRate={markupRow?.markup_rate ?? 0} />
          </div>
        </Card>
      </section>

      <section>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Markup Collected</h1>
          <div className="flex gap-1 rounded-lg bg-black/[.04] p-1 text-xs font-medium">
            {MARKUP_RANGE_OPTIONS.map((days) => (
              <Link
                key={days}
                href={`/admin?markupDays=${days}`}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  rangeDays === days ? "bg-white text-primary-700" : "text-foreground/60"
                }`}
              >
                {days === 0 ? "All time" : `${days}d`}
              </Link>
            ))}
          </div>
        </div>
        <Card className="flex flex-col gap-4 p-5">
          <p className="text-xs text-foreground/50">
            Revenue actually captured — the gap between Busha's real rate and what the customer was
            shown/credited, by currency. CNY conversions are computed from the stored margin on
            each row; swap markup is only available for transactions since this tracking shipped
            (older rows didn&rsquo;t record Busha&rsquo;s raw rate, so they&rsquo;re excluded here).
          </p>
          {markupByCurrency.size === 0 ? (
            <p className="text-sm text-foreground/50">No markup-bearing transactions in this range.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/40">
                  <th className="py-2 pr-4 font-medium">Currency</th>
                  <th className="py-2 pr-4 font-medium">CNY conversion markup</th>
                  <th className="py-2 pr-4 font-medium">Swap markup</th>
                  <th className="py-2 pr-4 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...markupByCurrency.entries()].map(([currency, { cny, swap }]) => (
                  <tr key={currency} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4 font-semibold">{currency}</td>
                    <td className="py-3 pr-4">{formatBalance(currency, cny)}</td>
                    <td className="py-3 pr-4">{formatBalance(currency, swap)}</td>
                    <td className="py-3 pr-4 font-semibold">{formatBalance(currency, cny + swap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
        <h1 className="mb-6 text-xl font-semibold">CNY Exchange Queue (Manual)</h1>
        {!rmbTransactions || rmbTransactions.length === 0 ? (
          <Card className="p-10 text-center text-sm text-foreground/50">
            No CNY exchange requests yet.
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
                      {tx.provider === "busha" && <Pill tone="neutral">automated</Pill>}
                      {tx.requires_extra_verification && (
                        <Pill tone={tx.extra_verification_confirmed_at ? "success" : "warning"}>
                          {tx.extra_verification_confirmed_at ? "ID verified" : "ID verification required"}
                        </Pill>
                      )}
                    </div>
                    <p className="text-sm text-foreground/60">
                      {profile?.full_name || profile?.email || tx.user_id}
                    </p>
                    <p className="text-xs text-foreground/50">
                      {recipient
                        ? recipient.wallet_address
                          ? `USDT (BSC) · ${recipient.wallet_address}`
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

                  <WithdrawalQueueActions
                    transactionId={tx.id}
                    status={tx.status}
                    requiresExtraVerification={tx.requires_extra_verification}
                    extraVerificationConfirmed={!!tx.extra_verification_confirmed_at}
                  />
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

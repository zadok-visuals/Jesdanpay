import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill, statusTone } from "@/components/ui/Pill";
import { formatBalance } from "@/lib/currency";
import { WithdrawalQueueActions } from "@/components/admin/WithdrawalQueueActions";
import { QueueFilters } from "@/components/admin/QueueFilters";
import { Pagination } from "@/components/admin/Pagination";
import { resolveUserIdsByEmail } from "@/lib/admin/search";
import { ADMIN_PAGE_SIZE, pageRange, parsePageParam, parseStringParam, type AdminSearchParams } from "@/lib/admin/pagination";
import { AUTOMATED_PAYOUT_MAX_RETRY_ATTEMPTS } from "@/lib/withdrawals/automated-payout";
import type { TransactionStatus } from "@/lib/types/database";

const STATUS_OPTIONS = [
  { value: "active", label: "Pending & processing" },
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

export default async function AdminWithdrawalsPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const admin = createAdminClient();
  const params = await searchParams;
  const page = parsePageParam(params);
  const email = parseStringParam(params, "email");
  const from = parseStringParam(params, "from");
  const to = parseStringParam(params, "to");
  const status = parseStringParam(params, "status") ?? "active";

  const userIdsFilter = await resolveUserIdsByEmail(admin, email);
  if (email && (userIdsFilter?.length ?? 0) === 0) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold">Withdrawal Requests</h1>
        <QueueFilters basePath="/admin/withdrawals" email={email} from={from} to={to} status={status} statusOptions={STATUS_OPTIONS} />
        <Card className="p-10 text-center text-sm text-foreground/50">No matching withdrawal requests.</Card>
      </div>
    );
  }

  let query = admin
    .from("transactions")
    .select("*", { count: "exact" })
    .eq("type", "withdrawal")
    .order("created_at", { ascending: false });

  if (status === "active") query = query.in("status", ["pending", "processing"]);
  else if (status !== "all") query = query.eq("status", status as TransactionStatus);
  if (userIdsFilter) query = query.in("user_id", userIdsFilter);
  if (from) query = query.gte("created_at", new Date(from).toISOString());
  if (to) query = query.lte("created_at", new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000).toISOString());

  const [fromRow, toRow] = pageRange(page);
  const { data: withdrawalTransactions, count } = await query.range(fromRow, toRow);

  const withdrawalUserIds = [...new Set((withdrawalTransactions ?? []).map((t) => t.user_id))];
  const [{ data: withdrawalRecipients }, { data: withdrawalProfiles }] = await Promise.all([
    withdrawalUserIds.length
      ? admin.from("withdrawal_recipients").select("*").in("user_id", withdrawalUserIds)
      : Promise.resolve({ data: [] }),
    withdrawalUserIds.length
      ? admin.from("profiles").select("id, email, full_name").in("id", withdrawalUserIds)
      : Promise.resolve({ data: [] }),
  ]);
  // BUG: since migration 0031, a user can have one withdrawal_recipients row PER CURRENCY, not
  // one total. Keying this map by user_id alone meant whichever currency's recipient loaded last
  // silently won for every currency for that user — e.g. a USDT withdrawal could display that
  // user's NGN bank details instead of their wallet address. Key by user_id+currency instead.
  const withdrawalRecipientByUserCurrency = new Map(
    (withdrawalRecipients ?? []).map((r) => [`${r.user_id}:${r.currency}`, r]),
  );
  const withdrawalProfileByUser = new Map((withdrawalProfiles ?? []).map((p) => [p.id, p]));

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Withdrawal Requests</h1>
      <QueueFilters basePath="/admin/withdrawals" email={email} from={from} to={to} status={status} statusOptions={STATUS_OPTIONS} />
      {!withdrawalTransactions || withdrawalTransactions.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">No withdrawal requests match these filters.</Card>
      ) : (
        <div className="flex flex-col gap-4">
          {withdrawalTransactions.map((tx) => {
            const recipient = withdrawalRecipientByUserCurrency.get(`${tx.user_id}:${tx.currency}`);
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
                    {tx.automated_payout_attempt_failed_reason && (
                      <Pill tone="warning">
                        Automation attempted, failed: {tx.automated_payout_attempt_failed_reason}
                        {tx.automated_payout_retry_count > 0 &&
                          ` (retry ${tx.automated_payout_retry_count}/${AUTOMATED_PAYOUT_MAX_RETRY_ATTEMPTS})`}
                      </Pill>
                    )}
                  </div>
                  <p className="text-sm text-foreground/60">
                    {profile?.full_name || "—"}{" "}
                    <Link href={`/admin/users/${tx.user_id}`} className="text-primary-600 hover:underline">
                      {profile?.email || tx.user_id}
                    </Link>
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
                      Net payout:{" "}
                      <strong className="font-semibold text-foreground">{formatBalance(tx.currency, tx.target_amount)}</strong>{" "}
                      (after 1% fee)
                    </p>
                  )}
                  <p className="text-xs text-foreground/40">{new Date(tx.created_at).toLocaleString()}</p>
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
      <Pagination page={page} pageSize={ADMIN_PAGE_SIZE} totalCount={count ?? 0} basePath="/admin/withdrawals" searchParams={params} />
    </div>
  );
}

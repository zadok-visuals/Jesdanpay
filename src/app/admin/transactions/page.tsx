import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchActivityByReference } from "@/lib/actions/activity";
import { Card } from "@/components/ui/Card";
import { Pill, statusTone } from "@/components/ui/Pill";
import { Pagination } from "@/components/admin/Pagination";
import { TransactionFilters } from "@/components/admin/TransactionFilters";
import { formatBalance } from "@/lib/currency";
import { pageRange, parsePageParam, parseStringParam, type AdminSearchParams } from "@/lib/admin/pagination";
import { resolveUserIdsBySearch } from "@/lib/admin/search";
import { ledgerKindLabel } from "@/lib/admin/ledger";
import type { AdminActivityLedgerRow, Currency, TransactionStatus } from "@/lib/types/database";

const TRANSACTIONS_PAGE_SIZE = 20;

function formatType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function UserCell({ row }: { row: AdminActivityLedgerRow }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-medium text-foreground">{row.user_name || "—"}</span>
      <Link href={`/admin/users/${row.user_id}`} className="truncate text-xs text-primary-600 hover:underline">
        {row.user_email || row.user_id}
      </Link>
    </div>
  );
}

function AmountCell({ row }: { row: AdminActivityLedgerRow }) {
  return (
    <div className="flex flex-col text-sm">
      <span className="font-medium">{formatBalance(row.currency, row.amount)}</span>
      {row.target_currency && row.target_amount != null && (
        <span className="text-xs text-foreground/50">→ {formatBalance(row.target_currency, row.target_amount)}</span>
      )}
      {row.fee != null && <span className="text-xs text-foreground/40">Fee: {formatBalance(row.currency, row.fee)}</span>}
    </div>
  );
}

export default async function AdminTransactionsPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  await requireAdminUser();
  const admin = createAdminClient();
  const params = await searchParams;

  // Keep the original single-reference lookup as a small standalone box — unrelated to the
  // paginated list below, and still the fastest way to jump straight to one specific order from
  // a provider reference a user quotes in a support message.
  const reference = parseStringParam(params, "reference");
  const { result: referenceResult, error: referenceError } = reference ? await searchActivityByReference(reference) : {};

  const page = parsePageParam(params);
  const search = parseStringParam(params, "search");
  const type = parseStringParam(params, "type") ?? "all";
  const status = parseStringParam(params, "status") ?? "all";
  const currency = parseStringParam(params, "currency") ?? "all";
  const from = parseStringParam(params, "from");
  const to = parseStringParam(params, "to");

  const userIdsFilter = await resolveUserIdsBySearch(admin, search);
  const noOtherFilters = type === "all" && status === "all" && currency === "all" && !from && !to;

  if (search && (userIdsFilter?.length ?? 0) === 0) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold">Transactions</h1>
        <ReferenceLookup reference={reference} referenceResult={referenceResult} referenceError={referenceError} />
        <TransactionFilters search={search} type={type} status={status} currency={currency} from={from} to={to} />
        <Card className="p-10 text-center text-sm text-foreground/50">No matching user.</Card>
      </div>
    );
  }

  let query = admin.from("admin_activity_ledger").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (type !== "all") query = query.eq("kind", type);
  if (status !== "all") query = query.eq("status", status as TransactionStatus);
  if (currency !== "all") query = query.eq("currency", currency as Currency);
  if (userIdsFilter) query = query.in("user_id", userIdsFilter);
  if (from) query = query.gte("created_at", new Date(from).toISOString());
  if (to) query = query.lte("created_at", new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000).toISOString());

  const [fromRow, toRow] = pageRange(page, TRANSACTIONS_PAGE_SIZE);
  const { data: rows, count } = await query.range(fromRow, toRow);

  // Real per-currency totals only make sense against the WHOLE ledger (admin_ledger_totals has
  // no type/status/currency/search params of its own) — with any of those filters active, an
  // amount total here would need a second, differently-filtered query that can itself be
  // truncated by the exact 1000-row cap this view was built to avoid. Falls back to a plain
  // count in that case, per the spec's own escape hatch.
  let totalsNode: React.ReactNode = null;
  if (noOtherFilters && !search) {
    const { data: totals } = await admin.rpc("admin_ledger_totals", { p_since: null });
    const completedByCurrency = new Map<string, number>();
    for (const t of totals ?? []) {
      if (t.status !== "completed") continue;
      completedByCurrency.set(t.currency, (completedByCurrency.get(t.currency) ?? 0) + t.total_amount);
    }
    totalsNode = (
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-white px-4 py-3 text-sm">
        <span className="font-medium text-foreground/70">All-time completed totals:</span>
        {[...completedByCurrency.entries()].map(([c, total]) => (
          <span key={c} className="text-foreground/60">
            {formatBalance(c as Currency, total)}
          </span>
        ))}
      </div>
    );
  } else {
    totalsNode = (
      <p className="mb-4 text-sm text-foreground/50">
        Showing {count ?? 0} matching this filter.
      </p>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Transactions</h1>

      <ReferenceLookup reference={reference} referenceResult={referenceResult} referenceError={referenceError} />

      <TransactionFilters search={search} type={type} status={status} currency={currency} from={from} to={to} />

      {totalsNode}

      {!rows || rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">No transactions match these filters.</Card>
      ) : (
        <>
          {/* Mobile: compact cards */}
          <div className="flex flex-col gap-3 sm:hidden">
            {rows.map((row) => (
              <Card key={`${row.source}-${row.id}`} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <UserCell row={row} />
                  <Pill tone={statusTone(row.status)}>{row.status}</Pill>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground/80">{ledgerKindLabel(row.kind)}</span>
                  <AmountCell row={row} />
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-foreground/40">
                  <span>{new Date(row.created_at).toLocaleString()}</span>
                  {row.reference && <span className="truncate">Ref: {row.reference}</span>}
                </div>
                {row.provider && <p className="text-xs text-foreground/30">via {row.provider}</p>}
              </Card>
            ))}
          </div>

          {/* Desktop: table */}
          <Card className="hidden overflow-x-auto p-0 sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/40">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.source}-${row.id}`} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-foreground/60">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="max-w-[220px] px-4 py-3">
                      <UserCell row={row} />
                    </td>
                    <td className="px-4 py-3">{ledgerKindLabel(row.kind)}</td>
                    <td className="px-4 py-3">
                      <AmountCell row={row} />
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={statusTone(row.status)}>{row.status}</Pill>
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-foreground/50">{row.reference || "—"}</td>
                    <td className="px-4 py-3 text-foreground/40">{row.provider || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <div className="mt-4">
        <Pagination page={page} pageSize={TRANSACTIONS_PAGE_SIZE} totalCount={count ?? 0} basePath="/admin/transactions" searchParams={params} />
      </div>
    </div>
  );
}

// The original single-reference lookup, unchanged in behavior — just pulled into its own small
// component so it can sit above the paginated list without crowding this file's main body.
function ReferenceLookup({
  reference,
  referenceResult,
  referenceError,
}: {
  reference: string | undefined;
  referenceResult: Awaited<ReturnType<typeof searchActivityByReference>>["result"];
  referenceError: string | undefined;
}) {
  return (
    <details className="group mb-4">
      <summary className="mb-2 cursor-pointer list-none text-sm font-medium text-primary-600 hover:underline">
        <span className="group-open:hidden">Find by reference number</span>
        <span className="hidden group-open:inline">Hide reference lookup</span>
      </summary>

      <form
        method="get"
        action="/admin/transactions"
        className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4"
      >
        <div className="flex flex-1 min-w-[240px] flex-col gap-1">
          <label htmlFor="reference" className="text-xs font-medium text-foreground/60">
            Reference number
          </label>
          <input
            id="reference"
            name="reference"
            type="text"
            defaultValue={reference}
            placeholder="e.g. BUSHA-REF-12345"
            className="rounded-lg border border-border px-3 py-1.5 text-sm"
          />
        </div>
        <button type="submit" className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-600">
          Search
        </button>
        {reference && (
          <a href="/admin/transactions" className="text-xs text-foreground/50 underline">
            Clear
          </a>
        )}
      </form>

      {reference && referenceError && <Card className="p-6 text-center text-sm text-foreground/50">{referenceError}</Card>}

      {referenceResult && (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{formatType(referenceResult.type)}</h2>
              <p className="text-xs text-foreground/50">{referenceResult.source === "deposit" ? "Deposit" : "Transaction"}</p>
            </div>
            <Pill tone={statusTone(referenceResult.status)}>{referenceResult.status}</Pill>
          </div>

          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <p>
              <span className="text-foreground/50">User:</span>{" "}
              <Link href={`/admin/users/${referenceResult.userId}`} className="text-primary-600 hover:underline">
                {referenceResult.userEmail}
              </Link>
            </p>
            <p>
              <span className="text-foreground/50">Reference:</span> {referenceResult.reference || "—"}
            </p>
            <p>
              <span className="text-foreground/50">Date:</span> {new Date(referenceResult.createdAt).toLocaleString()}
            </p>
            <p>
              <span className="text-foreground/50">Amount:</span> {formatBalance(referenceResult.sourceCurrency, referenceResult.sourceAmount)}
            </p>
            {referenceResult.targetAmount != null && referenceResult.targetCurrency && (
              <p>
                <span className="text-foreground/50">Target amount:</span>{" "}
                {formatBalance(referenceResult.targetCurrency, referenceResult.targetAmount)}
              </p>
            )}
            {referenceResult.fee != null && (
              <p>
                <span className="text-foreground/50">Fee:</span> {formatBalance(referenceResult.sourceCurrency, referenceResult.fee)}
              </p>
            )}
            {referenceResult.description && (
              <p className="sm:col-span-2">
                <span className="text-foreground/50">Details:</span> {referenceResult.description}
              </p>
            )}
          </div>

          {referenceResult.rejectionReason && (
            <div className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-500">
              <span className="font-medium">Rejection reason:</span> {referenceResult.rejectionReason}
            </div>
          )}
          {referenceResult.automatedPayoutFailedReason && (
            <div className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-500">
              <span className="font-medium">Automated payout failure:</span> {referenceResult.automatedPayoutFailedReason}
            </div>
          )}
        </Card>
      )}
    </details>
  );
}

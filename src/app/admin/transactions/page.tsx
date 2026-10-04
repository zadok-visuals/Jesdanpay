import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/admin";
import { searchActivityByReference } from "@/lib/actions/activity";
import { Card } from "@/components/ui/Card";
import { Pill, statusTone } from "@/components/ui/Pill";
import { formatBalance } from "@/lib/currency";
import { parseStringParam, type AdminSearchParams } from "@/lib/admin/pagination";

function formatType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function AdminTransactionsPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  await requireAdminUser();
  const params = await searchParams;
  const reference = parseStringParam(params, "reference");

  const { result, error } = reference ? await searchActivityByReference(reference) : {};

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Transactions</h1>

      <form method="get" action="/admin/transactions" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4">
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

      {!reference && (
        <Card className="p-10 text-center text-sm text-foreground/50">
          Enter a deposit or transaction reference number to look it up.
        </Card>
      )}

      {reference && error && <Card className="p-10 text-center text-sm text-foreground/50">{error}</Card>}

      {result && (
        <Card className="flex flex-col gap-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{formatType(result.type)}</h2>
              <p className="text-xs text-foreground/50">{result.source === "deposit" ? "Deposit" : "Transaction"}</p>
            </div>
            <Pill tone={statusTone(result.status)}>{result.status}</Pill>
          </div>

          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <p>
              <span className="text-foreground/50">User:</span>{" "}
              <Link href={`/admin/users/${result.userId}`} className="text-primary-600 hover:underline">
                {result.userEmail}
              </Link>
            </p>
            <p>
              <span className="text-foreground/50">Reference:</span> {result.reference || "—"}
            </p>
            <p>
              <span className="text-foreground/50">Date:</span> {new Date(result.createdAt).toLocaleString()}
            </p>
            <p>
              <span className="text-foreground/50">Amount:</span> {formatBalance(result.sourceCurrency, result.sourceAmount)}
            </p>
            {result.targetAmount != null && result.targetCurrency && (
              <p>
                <span className="text-foreground/50">Target amount:</span> {formatBalance(result.targetCurrency, result.targetAmount)}
              </p>
            )}
            {result.fee != null && (
              <p>
                <span className="text-foreground/50">Fee:</span> {formatBalance(result.sourceCurrency, result.fee)}
              </p>
            )}
            {result.confirmedAmount != null && result.confirmedAmount !== result.sourceAmount && (
              <p>
                <span className="text-foreground/50">Confirmed amount:</span>{" "}
                {formatBalance(result.sourceCurrency, result.confirmedAmount)}
              </p>
            )}
            {result.description && (
              <p className="sm:col-span-2">
                <span className="text-foreground/50">Details:</span> {result.description}
              </p>
            )}
          </div>

          {result.rejectionReason && (
            <div className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-500">
              <span className="font-medium">Rejection reason:</span> {result.rejectionReason}
            </div>
          )}
          {result.automatedPayoutFailedReason && (
            <div className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-500">
              <span className="font-medium">Automated payout failure:</span> {result.automatedPayoutFailedReason}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

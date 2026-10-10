// Native GET form, same convention as QueueFilters — no client JS needed. Separate component
// (rather than extending QueueFilters) because the transactions ledger needs a name search and
// two extra selects (type, currency) that no other admin queue needs.
const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "deposit", label: "Deposit" },
  { value: "swap", label: "Swap" },
  { value: "cny_conversion", label: "CNY conversion" },
  { value: "china_payment", label: "Payment to China" },
  { value: "withdrawal", label: "Withdrawal" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

const CURRENCY_OPTIONS = ["all", "NGN", "GHS", "KES", "USDT", "CNY"];

export function TransactionFilters({
  search,
  type,
  status,
  currency,
  from,
  to,
}: {
  search?: string;
  type?: string;
  status?: string;
  currency?: string;
  from?: string;
  to?: string;
}) {
  const hasActiveFilter =
    !!search || (!!type && type !== "all") || (!!status && status !== "all") || (!!currency && currency !== "all") || !!from || !!to;

  return (
    <form
      method="get"
      action="/admin/transactions"
      className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4"
    >
      <div className="flex min-w-[200px] flex-1 flex-col gap-1">
        <label htmlFor="search" className="text-xs font-medium text-foreground/60">
          Name or email
        </label>
        <input
          id="search"
          name="search"
          type="text"
          defaultValue={search}
          placeholder="user@example.com or Jane Doe"
          className="rounded-lg border border-border px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="type" className="text-xs font-medium text-foreground/60">
          Type
        </label>
        <select id="type" name="type" defaultValue={type ?? "all"} className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm">
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-xs font-medium text-foreground/60">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={status ?? "all"}
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="currency" className="text-xs font-medium text-foreground/60">
          Currency
        </label>
        <select
          id="currency"
          name="currency"
          defaultValue={currency ?? "all"}
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm"
        >
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c === "all" ? "All currencies" : c}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="from" className="text-xs font-medium text-foreground/60">
          From
        </label>
        <input id="from" name="from" type="date" defaultValue={from} className="rounded-lg border border-border px-3 py-1.5 text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="to" className="text-xs font-medium text-foreground/60">
          To
        </label>
        <input id="to" name="to" type="date" defaultValue={to} className="rounded-lg border border-border px-3 py-1.5 text-sm" />
      </div>
      <button type="submit" className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-600">
        Filter
      </button>
      {hasActiveFilter && (
        <a href="/admin/transactions" className="text-xs text-foreground/50 underline">
          Clear
        </a>
      )}
    </form>
  );
}

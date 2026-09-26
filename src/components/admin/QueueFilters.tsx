// Native GET form — no client JS needed, matches this codebase's existing plain-link searchParams
// convention. Submitting resets to page 1 implicitly (no `page` field in the form), which is the
// right behavior any time the filter set changes.
export function QueueFilters({
  basePath,
  email,
  from,
  to,
  status,
  statusOptions,
}: {
  basePath: string;
  email?: string;
  from?: string;
  to?: string;
  status?: string;
  statusOptions?: { value: string; label: string }[];
}) {
  const hasActiveFilter = !!email || !!from || !!to || (!!status && status !== "active");

  return (
    <form
      method="get"
      action={basePath}
      className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${basePath}-email`} className="text-xs font-medium text-foreground/60">
          Email
        </label>
        <input
          id={`${basePath}-email`}
          name="email"
          type="text"
          defaultValue={email}
          placeholder="user@example.com"
          className="rounded-lg border border-border px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${basePath}-from`} className="text-xs font-medium text-foreground/60">
          From
        </label>
        <input
          id={`${basePath}-from`}
          name="from"
          type="date"
          defaultValue={from}
          className="rounded-lg border border-border px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${basePath}-to`} className="text-xs font-medium text-foreground/60">
          To
        </label>
        <input
          id={`${basePath}-to`}
          name="to"
          type="date"
          defaultValue={to}
          className="rounded-lg border border-border px-3 py-1.5 text-sm"
        />
      </div>
      {statusOptions && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${basePath}-status`} className="text-xs font-medium text-foreground/60">
            Status
          </label>
          <select
            id={`${basePath}-status`}
            name="status"
            defaultValue={status ?? "active"}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm"
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <button
        type="submit"
        className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-600"
      >
        Filter
      </button>
      {hasActiveFilter && (
        <a href={basePath} className="text-xs text-foreground/50 underline">
          Clear
        </a>
      )}
    </form>
  );
}

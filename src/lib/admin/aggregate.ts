// Sums a numeric field grouped by a string key (currency, in every current use) — Postgrest has
// no native group-by aggregation through the JS client, so this is the "fetch raw rows, aggregate
// in JS" pattern already used throughout the admin panel (src/app/admin/pnl/page.tsx). Shared by
// src/app/admin/page.tsx and src/app/admin/users/[id]/page.tsx rather than each keeping its own
// copy.
export function sumByCurrency<T>(rows: T[], currencyOf: (row: T) => string, amountOf: (row: T) => number): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = currencyOf(row);
    totals.set(currency, (totals.get(currency) ?? 0) + amountOf(row));
  }
  return totals;
}

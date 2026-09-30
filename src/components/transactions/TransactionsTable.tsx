"use client";

import { useMemo, useState } from "react";
import type { UnifiedActivity } from "@/lib/transactions";
import { formatBalance } from "@/lib/currency";
import { Pill, statusTone } from "@/components/ui/Pill";
import { TransactionDetailModal } from "@/components/transactions/TransactionDetailModal";

// Buckets a row's raw `type` (deposit, withdrawal, usdt_ngn, rmb_manual, rmb_auto,
// convert_to_cny, convert_from_cny — see TransactionDetailModal's TYPE_LABELS for the full list)
// into the three groups the filter offers. Everything that isn't a plain deposit or withdrawal is
// some kind of conversion/exchange, so that bucket is the catch-all rather than an enumerated list
// that would need updating every time a new conversion type is added.
type TypeFilter = "all" | "deposit" | "withdrawal" | "conversion";

function bucketType(type: string): Exclude<TypeFilter, "all"> {
  if (type === "deposit") return "deposit";
  if (type === "withdrawal") return "withdrawal";
  return "conversion";
}

const FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "deposit", label: "Deposits" },
  { value: "withdrawal", label: "Withdrawals" },
  { value: "conversion", label: "Conversions" },
];

// showFilter defaults to false so the Home page's 5-row recent-activity list (which reuses this
// same component) is unaffected — only the full /transactions page turns it on. Entirely
// client-side: fetchUnifiedActivity already returns the full list to that page, no new server
// round trip needed to filter it.
export function TransactionsTable({
  transactions,
  showFilter = false,
}: {
  transactions: UnifiedActivity[];
  showFilter?: boolean;
}) {
  const [selected, setSelected] = useState<{ source: UnifiedActivity["source"]; id: string } | null>(
    null,
  );
  const [filter, setFilter] = useState<TypeFilter>("all");

  const filtered = useMemo(
    () => (filter === "all" ? transactions : transactions.filter((tx) => bucketType(tx.type) === filter)),
    [transactions, filter],
  );

  const filterBar = showFilter && (
    <div className="mb-4 flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-black/[.04] p-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {FILTER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setFilter(option.value)}
          className={`shrink-0 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            option.value === filter ? "bg-white text-primary-700" : "text-foreground/60 hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  if (filtered.length === 0) {
    return (
      <div>
        {filterBar}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
          <p className="text-sm font-medium text-foreground/60">
            {filter === "all" ? "No transactions yet" : "No matching transactions"}
          </p>
          <p className="mt-1 text-xs text-foreground/40">
            Your deposits, CNY and USDT exchanges, and withdrawals will show up here once you make
            one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {filterBar}
      <TransactionsTableBody transactions={filtered} onSelect={setSelected} />
      <TransactionDetailModal activity={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// Split out purely so the empty-state check above (which needs to know about the active filter
// to show "No matching transactions" vs. "No transactions yet") doesn't also have to duplicate
// the table markup — this is only ever called with a non-empty list.
function TransactionsTableBody({
  transactions,
  onSelect,
}: {
  transactions: UnifiedActivity[];
  onSelect: (activity: { source: UnifiedActivity["source"]; id: string }) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/40">
            <th className="py-2 pr-4 font-medium">Date</th>
            <th className="py-2 pr-4 font-medium">Amount</th>
            <th className="py-2 pr-4 font-medium">Type</th>
            <th className="py-2 pr-4 font-medium">Description</th>
            <th className="py-2 pr-4 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr
              key={`${tx.source}-${tx.id}`}
              onClick={() => onSelect({ source: tx.source, id: tx.id })}
              className="cursor-pointer border-b border-border last:border-0 hover:bg-black/[.02]"
            >
              <td className="py-3 pr-4 text-foreground/70">
                {/* Explicit locale — the server's process locale and the browser's can disagree,
                    which was producing a hydration mismatch (e.g. "26/09/2026" vs "9/26/2026"). */}
                {new Date(tx.created_at).toLocaleDateString("en-US")}
              </td>
              <td className="py-3 pr-4 font-medium">{formatBalance(tx.currency, tx.amount)}</td>
              <td className="py-3 pr-4 text-foreground/70">{tx.type}</td>
              <td className="py-3 pr-4 text-foreground/70">{tx.reference ?? "—"}</td>
              <td className="py-3 pr-4">
                <Pill tone={statusTone(tx.status)}>{tx.status}</Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

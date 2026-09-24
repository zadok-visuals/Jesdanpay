"use client";

import { useState } from "react";
import type { UnifiedActivity } from "@/lib/transactions";
import { formatBalance } from "@/lib/currency";
import { Pill, statusTone } from "@/components/ui/Pill";
import { TransactionDetailModal } from "@/components/transactions/TransactionDetailModal";

export function TransactionsTable({ transactions }: { transactions: UnifiedActivity[] }) {
  const [selected, setSelected] = useState<{ source: UnifiedActivity["source"]; id: string } | null>(
    null,
  );

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
        <p className="text-sm font-medium text-foreground/60">No transactions yet</p>
        <p className="mt-1 text-xs text-foreground/40">
          Your deposits, CNY and USDT exchanges, and withdrawals will show up here once you make
          one.
        </p>
      </div>
    );
  }

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
              onClick={() => setSelected({ source: tx.source, id: tx.id })}
              className="cursor-pointer border-b border-border last:border-0 hover:bg-black/[.02]"
            >
              <td className="py-3 pr-4 text-foreground/70">
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
      <TransactionDetailModal activity={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

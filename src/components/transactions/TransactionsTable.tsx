import type { Transaction } from "@/lib/types/database";
import { formatBalance } from "@/lib/currency";
import { Pill, statusTone } from "@/components/ui/Pill";

export function TransactionsTable({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
        <p className="text-sm font-medium text-foreground/60">No transactions yet</p>
        <p className="mt-1 text-xs text-foreground/40">
          Your RMB and USDT exchanges will show up here once you make one.
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
            <tr key={tx.id} className="border-b border-border last:border-0">
              <td className="py-3 pr-4 text-foreground/70">
                {new Date(tx.created_at).toLocaleDateString()}
              </td>
              <td className="py-3 pr-4 font-medium">{formatBalance(tx.currency, tx.amount)}</td>
              <td className="py-3 pr-4 text-foreground/70">{tx.type}</td>
              <td className="py-3 pr-4 text-foreground/70">{tx.provider_reference ?? "—"}</td>
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

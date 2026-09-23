import type { createClient } from "@/lib/supabase/server";
import type { Currency, TransactionStatus } from "@/lib/types/database";

// Deposits are written to their own table (see src/lib/actions/busha.ts) — separate from
// `transactions` (exchanges, withdrawals, RMB sends). The Transactions page previously only
// queried `transactions`, so no deposit — successful, failed, or expired — ever showed up
// there. This unifies both at read time (Option A: lower risk than migrating deposits into
// `transactions` outright, and nothing about how either table is written needs to change).
export interface UnifiedActivity {
  id: string;
  source: "transaction" | "deposit";
  type: string;
  amount: number;
  currency: Currency;
  status: TransactionStatus;
  reference: string | null;
  created_at: string;
}

export async function fetchUnifiedActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  limit?: number,
): Promise<UnifiedActivity[]> {
  const [{ data: transactions }, { data: deposits }] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("deposits").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);

  const fromTransactions: UnifiedActivity[] = (transactions ?? []).map((t) => ({
    id: t.id,
    source: "transaction",
    type: t.type,
    amount: t.amount,
    currency: t.currency,
    status: t.status,
    reference: t.provider_reference,
    created_at: t.created_at,
  }));

  // Deposits show their real status — pending, completed, or failed (a Busha transfer that
  // expired or was cancelled leaves fail_deposit's trail here rather than vanishing) — not just
  // the successful ones, which is the client's exact complaint about failed/expired deposits.
  const fromDeposits: UnifiedActivity[] = (deposits ?? []).map((d) => ({
    id: d.id,
    source: "deposit",
    type: "deposit",
    amount: d.amount,
    currency: d.currency,
    status: d.status,
    reference: d.provider_reference,
    created_at: d.created_at,
  }));

  const merged = [...fromTransactions, ...fromDeposits].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return typeof limit === "number" ? merged.slice(0, limit) : merged;
}

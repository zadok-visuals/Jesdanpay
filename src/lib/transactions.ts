import type { createClient } from "@/lib/supabase/server";
import type { Currency, TransactionStatus } from "@/lib/types/database";

// Deposits and CNY conversions are each written to their own table, separate from
// `transactions` (exchanges, withdrawals, RMB sends). The Transactions page previously only
// queried `transactions`, so neither ever showed up there. This unifies all three at read time
// (Option A: lower risk than migrating everything into `transactions` outright, and nothing
// about how any of the three tables is written needs to change).
//
// IMPORTANT: this is now the THIRD table that had to be added here after already shipping —
// first `deposits`, then `cny_conversions`. Any new table that records user financial activity
// (a payment, a conversion, a payout — anything that debits/credits a wallet) MUST be added as a
// fourth source here, or it will silently vanish from both Home's recent-activity list and the
// full Transactions page, exactly like the first two did.
export interface UnifiedActivity {
  id: string;
  source: "transaction" | "deposit" | "cny_conversion";
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
  const [{ data: transactions }, { data: deposits }, { data: cnyConversions }] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("deposits").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("cny_conversions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
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

  // A conversion is credited/debited atomically inside record_cny_conversion — there's no
  // pending/failed state to represent, so status is always "completed" and there's no
  // provider reference to show.
  const fromCnyConversions: UnifiedActivity[] = (cnyConversions ?? []).map((c) => ({
    id: c.id,
    source: "cny_conversion",
    type: `convert_${c.direction}`,
    amount: c.to_amount,
    currency: c.to_currency,
    status: "completed",
    reference: null,
    created_at: c.created_at,
  }));

  const merged = [...fromTransactions, ...fromDeposits, ...fromCnyConversions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return typeof limit === "number" ? merged.slice(0, limit) : merged;
}

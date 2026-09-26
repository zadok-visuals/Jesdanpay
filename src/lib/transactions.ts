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
  // Filters each source query to the currency it maps into UnifiedActivity.currency below —
  // transactions.currency, deposits.currency, cny_conversions.to_currency respectively. Used by
  // the Accounts page to show a per-currency-tab history without a client round trip per tab.
  currency?: Currency,
): Promise<UnifiedActivity[]> {
  let transactionsQuery = supabase.from("transactions").select("*").eq("user_id", userId);
  let depositsQuery = supabase.from("deposits").select("*").eq("user_id", userId);
  let cnyConversionsQuery = supabase.from("cny_conversions").select("*").eq("user_id", userId);
  if (currency) {
    // A swap/exchange row stores currency (source) and target_currency (destination) — match
    // either side, not just the source, so e.g. a NGN->USDT swap shows up under both tabs, not
    // just NGN. deposits and cny_conversions are untouched: each only ever has one currency side.
    transactionsQuery = transactionsQuery.or(`currency.eq.${currency},target_currency.eq.${currency}`);
    depositsQuery = depositsQuery.eq("currency", currency);
    cnyConversionsQuery = cnyConversionsQuery.eq("to_currency", currency);
  }

  const [{ data: transactions }, { data: deposits }, { data: cnyConversions }] = await Promise.all([
    transactionsQuery.order("created_at", { ascending: false }),
    depositsQuery.order("created_at", { ascending: false }),
    cnyConversionsQuery.order("created_at", { ascending: false }),
  ]);

  const fromTransactions: UnifiedActivity[] = (transactions ?? []).map((t) => {
    // When filtering by currency and this row only matched on target_currency (not currency),
    // show the side that actually pertains to the requested currency — otherwise a USDT-tab row
    // would confusingly display its NGN source amount instead of the USDT it actually credited.
    const matchedOnTargetOnly = currency != null && t.currency !== currency && t.target_currency === currency;
    return {
      id: t.id,
      source: "transaction",
      type: t.type,
      amount: matchedOnTargetOnly ? (t.target_amount ?? t.amount) : t.amount,
      currency: matchedOnTargetOnly ? (t.target_currency as Currency) : t.currency,
      status: t.status,
      reference: t.provider_reference,
      created_at: t.created_at,
    };
  });

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

// "Is this activity the most recent one touching this currency" — used by the transaction detail
// receipt to decide between "New balance" (nothing happened to this currency since) and "Current
// balance" (a later transaction/deposit/conversion already moved it further). Uses the exact same
// per-table currency-matching semantics as fetchUnifiedActivity above (including the transactions
// table's either-side match), so this stays consistent with what the per-currency activity list
// itself would show.
export async function isMostRecentForCurrency(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  currency: Currency,
  createdAt: string,
): Promise<boolean> {
  const [{ count: laterTransactions }, { count: laterDeposits }, { count: laterConversions }] = await Promise.all([
    supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .or(`currency.eq.${currency},target_currency.eq.${currency}`)
      .gt("created_at", createdAt),
    supabase
      .from("deposits")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("currency", currency)
      .gt("created_at", createdAt),
    supabase
      .from("cny_conversions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("to_currency", currency)
      .gt("created_at", createdAt),
  ]);
  return (laterTransactions ?? 0) === 0 && (laterDeposits ?? 0) === 0 && (laterConversions ?? 0) === 0;
}

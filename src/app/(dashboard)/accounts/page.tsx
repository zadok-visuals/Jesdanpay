import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountsView } from "@/components/wallet/AccountsView";
import { fetchUnifiedActivity, type UnifiedActivity } from "@/lib/transactions";
import type { Currency } from "@/lib/types/database";

export default async function AccountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: wallets }, { data: withdrawalRecipients }] = await Promise.all([
    supabase.from("wallets").select("*").eq("user_id", user.id).order("currency"),
    // A user can now have one recipient per currency (see migration 0031) — fetch them all,
    // AccountsView/WithdrawForm pick the one matching whichever currency tab is active.
    supabase.from("withdrawal_recipients").select("*").eq("user_id", user.id),
  ]);

  // One history fetch per currency the user holds, up front, so switching AccountsView's
  // client-side currency tab never needs its own network round trip.
  const activityEntries = await Promise.all(
    (wallets ?? []).map(
      async (w) => [w.currency, await fetchUnifiedActivity(supabase, user.id, undefined, w.currency)] as const,
    ),
  );
  const activityByCurrency = Object.fromEntries(activityEntries) as Record<Currency, UnifiedActivity[]>;

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Accounts</h1>
      <AccountsView
        wallets={wallets ?? []}
        withdrawalRecipients={withdrawalRecipients ?? []}
        activityByCurrency={activityByCurrency}
      />
    </div>
  );
}

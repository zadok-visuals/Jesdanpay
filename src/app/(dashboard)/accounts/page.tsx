import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountsView } from "@/components/wallet/AccountsView";

export default async function AccountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: wallets }, { data: withdrawalRecipient }] = await Promise.all([
    supabase.from("wallets").select("*").eq("user_id", user.id).order("currency"),
    supabase.from("withdrawal_recipients").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Accounts</h1>
      <AccountsView wallets={wallets ?? []} withdrawalRecipient={withdrawalRecipient ?? null} />
    </div>
  );
}

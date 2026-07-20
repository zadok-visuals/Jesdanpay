import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TotalBalanceCard } from "@/components/wallet/TotalBalanceCard";
import { CurrencyBalanceRow } from "@/components/wallet/CurrencyBalanceRow";
import { KycStatusBanner } from "@/components/kyc/KycStatusBanner";
import { TransactionsTable } from "@/components/transactions/TransactionsTable";
import { Card } from "@/components/ui/Card";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: wallets }, { data: transactions }] = await Promise.all([
    supabase.from("profiles").select("kyc_status").eq("id", user.id).single(),
    supabase.from("wallets").select("*").eq("user_id", user.id).order("currency"),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {profile && <KycStatusBanner status={profile.kyc_status} />}

      <TotalBalanceCard wallets={wallets ?? []} />

      <CurrencyBalanceRow wallets={wallets ?? []} />

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent transactions</h2>
          <Link href="/transactions" className="text-sm font-medium text-primary-600 hover:underline">
            See all
          </Link>
        </div>
        <TransactionsTable transactions={transactions ?? []} />
      </Card>
    </div>
  );
}

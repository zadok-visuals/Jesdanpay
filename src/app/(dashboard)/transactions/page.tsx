import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { TransactionsTable } from "@/components/transactions/TransactionsTable";
import { fetchUnifiedActivity } from "@/lib/transactions";

export default async function TransactionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activity = await fetchUnifiedActivity(supabase, user.id);

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Transactions</h1>
      <Card className="p-6">
        <TransactionsTable transactions={activity} />
      </Card>
    </div>
  );
}

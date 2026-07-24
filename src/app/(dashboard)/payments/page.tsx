import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PaymentsView } from "@/components/payments/PaymentsView";

export default async function PaymentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: wallets } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", user.id)
    .order("currency");

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Payments</h1>
      <PaymentsView wallets={wallets ?? []} />
    </div>
  );
}

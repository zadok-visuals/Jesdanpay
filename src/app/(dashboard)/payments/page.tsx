import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PaymentsView } from "@/components/payments/PaymentsView";

export default async function PaymentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: wallets }, { data: fxRates }, { data: savedRecipients }] = await Promise.all([
    supabase.from("wallets").select("*").eq("user_id", user.id).order("currency"),
    supabase.from("admin_fx_rates").select("*"),
    supabase
      .from("saved_rmb_recipients")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Payments</h1>
      <PaymentsView
        wallets={wallets ?? []}
        fxRates={fxRates ?? []}
        savedRecipients={savedRecipients ?? []}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RmbExchangeForm } from "@/components/payments/RmbExchangeForm";

export default async function PayToChinaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: wallets }, { data: savedRecipients }, { data: tierRates }, { data: markupRow }] =
    await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", user.id).order("currency"),
      supabase
        .from("saved_rmb_recipients")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("cny_tier_rates").select("*").order("tier_min_cny"),
      supabase.from("cny_markup_rate").select("*").single(),
    ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Pay to China</h1>
      <RmbExchangeForm
        wallets={wallets ?? []}
        savedRecipients={savedRecipients ?? []}
        tierRates={tierRates ?? []}
        markupRate={markupRow?.markup_rate ?? 0}
      />
    </div>
  );
}

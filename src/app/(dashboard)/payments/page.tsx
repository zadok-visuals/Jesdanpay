import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PaymentsView } from "@/components/payments/PaymentsView";

export default async function PaymentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: wallets }, { data: tierRates }, { data: markupRow }] = await Promise.all([
    supabase.from("wallets").select("*").eq("user_id", user.id).order("currency"),
    supabase.from("cny_tier_rates").select("*").order("tier_min_cny"),
    supabase.from("cny_markup_rate").select("*").single(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Conversions</h1>
      <PaymentsView
        wallets={wallets ?? []}
        tierRates={tierRates ?? []}
        fiatMarkupRate={markupRow?.fiat_markup_rate ?? 0}
        usdtMarkupRate={markupRow?.usdt_markup_rate ?? 0}
      />
    </div>
  );
}

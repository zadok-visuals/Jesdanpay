import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill, type PillTone } from "@/components/ui/Pill";

async function countActive(
  admin: ReturnType<typeof createAdminClient>,
  type: "rmb_manual" | "withdrawal",
): Promise<number> {
  const { count } = await admin
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("type", type)
    .in("status", ["pending", "processing"]);
  return count ?? 0;
}

export default async function AdminIndexPage() {
  const admin = createAdminClient();

  const [{ count: kycCount }, rmbCount, withdrawalCount, { count: totalUsers }] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }).eq("kyc_status", "pending"),
    countActive(admin, "rmb_manual"),
    countActive(admin, "withdrawal"),
    admin.from("profiles").select("*", { count: "exact", head: true }),
  ]);

  const cards: { href: string; label: string; count: number | null; description: string; tone?: PillTone }[] = [
    { href: "/admin/users", label: "Total Users", count: totalUsers ?? 0, description: "All registered profiles", tone: "neutral" },
    { href: "/admin/kyc", label: "KYC Review", count: kycCount ?? 0, description: "Pending identity verifications" },
    { href: "/admin/rmb", label: "CNY Exchange Queue", count: rmbCount, description: "Pending & processing RMB manual transfers" },
    { href: "/admin/withdrawals", label: "Withdrawal Requests", count: withdrawalCount, description: "Pending & processing payouts" },
    { href: "/admin/rates", label: "Rates & Markup", count: null, description: "CNY tier rates, margin, and revenue collected" },
    { href: "/admin/pnl", label: "PNL", count: null, description: "Realized margin vs. supplier cost" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Admin Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="flex h-full flex-col gap-2 p-5 transition-colors hover:border-primary-300">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{card.label}</h2>
                {card.count != null && card.count > 0 && <Pill tone={card.tone ?? "warning"}>{card.count}</Pill>}
              </div>
              <p className="text-xs text-foreground/50">{card.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

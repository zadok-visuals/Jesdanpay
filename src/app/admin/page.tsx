import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { formatBalance } from "@/lib/currency";
import { sumByCurrency } from "@/lib/admin/aggregate";
import type { Currency } from "@/lib/types/database";

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

async function countKycStatus(admin: ReturnType<typeof createAdminClient>, status: "approved" | "pending" | "rejected"): Promise<number> {
  const { count } = await admin.from("profiles").select("*", { count: "exact", head: true }).eq("kyc_status", status);
  return count ?? 0;
}

function last24hCutoffIso(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function CurrencyStatRows({ totals }: { totals: Map<string, number> }) {
  if (totals.size === 0) {
    return <p className="text-xs text-foreground/50">No data yet.</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {[...totals.entries()].map(([currency, total]) => (
        <div key={currency} className="flex items-center justify-between text-sm">
          <span className="text-foreground/50">{currency}</span>
          <span className="font-medium">{formatBalance(currency as Currency, total)}</span>
        </div>
      ))}
    </div>
  );
}

export default async function AdminIndexPage() {
  const admin = createAdminClient();
  const last24h = last24hCutoffIso();

  const [
    { count: kycCount },
    rmbCount,
    withdrawalCount,
    { count: totalUsers },
    { data: completedTransactions },
    { data: wallets },
    { data: last24hTransactions },
    approvedKyc,
    pendingKyc,
    rejectedKyc,
  ] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }).eq("kyc_status", "pending"),
    countActive(admin, "rmb_manual"),
    countActive(admin, "withdrawal"),
    admin.from("profiles").select("*", { count: "exact", head: true }),
    // Total volume per currency — every completed transaction regardless of type, same
    // "fetch raw rows, aggregate in JS" approach already used by admin/pnl (Postgrest has no
    // native group-by through the JS client).
    admin.from("transactions").select("currency, amount").eq("status", "completed"),
    admin.from("wallets").select("currency, balance"),
    admin.from("transactions").select("currency, amount").gte("created_at", last24h),
    countKycStatus(admin, "approved"),
    countKycStatus(admin, "pending"),
    countKycStatus(admin, "rejected"),
  ]);

  const volumeTotals = sumByCurrency(completedTransactions ?? [], (t) => t.currency, (t) => t.amount);
  const balanceTotals = sumByCurrency(wallets ?? [], (w) => w.currency, (w) => w.balance);
  const last24hTotals = sumByCurrency(last24hTransactions ?? [], (t) => t.currency, (t) => t.amount);
  const last24hCount = last24hTransactions?.length ?? 0;

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

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Total volume (completed transactions)</h2>
          <CurrencyStatRows totals={volumeTotals} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Wallet balances currently held</h2>
          <CurrencyStatRows totals={balanceTotals} />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Last 24 hours</h2>
          <p className="text-2xl font-bold">{last24hCount}</p>
          <p className="mb-3 text-xs text-foreground/50">transaction{last24hCount === 1 ? "" : "s"}</p>
          <CurrencyStatRows totals={last24hTotals} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">KYC approval rate</h2>
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-foreground/50">Approved</span>
              <span className="font-medium">{approvedKyc}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-foreground/50">Pending</span>
              <span className="font-medium">{pendingKyc}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-foreground/50">Rejected</span>
              <span className="font-medium">{rejectedKyc}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

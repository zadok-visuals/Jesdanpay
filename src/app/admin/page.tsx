import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdminUser, getAdminRole } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill, type PillTone } from "@/components/ui/Pill";
import {
  UsersIcon,
  ShieldCheckIcon,
  ExchangeIcon,
  WithdrawIcon,
  TagIcon,
  ChartBarIcon,
  TrendingUpIcon,
  ClockIcon,
  PieChartIcon,
  AdminIcon,
} from "@/components/layout/NavIcons";
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

// Three soft accents, all within the app's existing green/gold/neutral palette (no new colors) —
// amber for things waiting on an admin, green for money, neutral for general overview stats.
type Accent = "amber" | "green" | "neutral";

const ACCENT_CLASSES: Record<Accent, string> = {
  amber: "bg-accent-100 text-accent-700",
  green: "bg-primary-100 text-primary-700",
  neutral: "bg-black/[.05] text-foreground/60",
};

function SectionHeader({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold text-foreground/60">{children}</h2>;
}

function StatCard({
  href,
  icon,
  accent,
  title,
  count,
  tone,
  description,
  children,
}: {
  href?: string;
  icon: ReactNode;
  accent: Accent;
  title: string;
  count?: number | null;
  tone?: PillTone;
  description?: string;
  children?: ReactNode;
}) {
  const body = (
    <Card className={`flex h-full flex-col gap-3 p-5 ${href ? "transition-colors hover:border-primary-300" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${ACCENT_CLASSES[accent]}`}>
            {icon}
          </div>
          <h3 className="font-semibold">{title}</h3>
        </div>
        {count != null && count > 0 && <Pill tone={tone ?? "warning"}>{count}</Pill>}
      </div>
      {description && <p className="text-xs text-foreground/50">{description}</p>}
      {children}
    </Card>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}

function QuickActionTile({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold transition-colors hover:border-primary-300 hover:bg-primary-50 sm:w-auto"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700">{icon}</div>
      {label}
    </Link>
  );
}

export default async function AdminIndexPage() {
  const adminUser = await requireAdminUser();
  const admin = createAdminClient();
  const last24h = last24hCutoffIso();

  const [
    role,
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
    getAdminRole(adminUser.id, adminUser.email),
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

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Admin Dashboard</h1>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        <QuickActionTile href="/admin/kyc" icon={<ShieldCheckIcon className="h-[18px] w-[18px]" />} label="KYC Review" />
        <QuickActionTile href="/admin/rmb" icon={<ExchangeIcon className="h-[18px] w-[18px]" />} label="RMB Queue" />
        <QuickActionTile href="/admin/withdrawals" icon={<WithdrawIcon className="h-[18px] w-[18px]" />} label="Withdrawals" />
        {role === "super_admin" && (
          <QuickActionTile href="/admin/administrators" icon={<AdminIcon className="h-[18px] w-[18px]" />} label="Administrators" />
        )}
      </div>

      <section className="mb-8">
        <SectionHeader>Needs attention</SectionHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            href="/admin/kyc"
            icon={<ShieldCheckIcon className="h-[18px] w-[18px]" />}
            accent="amber"
            title="KYC Review"
            count={kycCount}
            description="Pending identity verifications"
          />
          <StatCard
            href="/admin/rmb"
            icon={<ExchangeIcon className="h-[18px] w-[18px]" />}
            accent="amber"
            title="CNY Exchange Queue"
            count={rmbCount}
            description="Pending & processing RMB manual transfers"
          />
          <StatCard
            href="/admin/withdrawals"
            icon={<WithdrawIcon className="h-[18px] w-[18px]" />}
            accent="amber"
            title="Withdrawal Requests"
            count={withdrawalCount}
            description="Pending & processing payouts"
          />
        </div>
      </section>

      <section className="mb-8">
        <SectionHeader>Financials</SectionHeader>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StatCard icon={<ChartBarIcon className="h-[18px] w-[18px]" />} accent="green" title="Total volume (completed transactions)">
            <CurrencyStatRows totals={volumeTotals} />
          </StatCard>
          <StatCard icon={<TagIcon className="h-[18px] w-[18px]" />} accent="green" title="Wallet balances currently held">
            <CurrencyStatRows totals={balanceTotals} />
          </StatCard>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            href="/admin/rates"
            icon={<TagIcon className="h-[18px] w-[18px]" />}
            accent="green"
            title="Rates & Markup"
            description="CNY tier rates, margin, and revenue collected"
          />
          <StatCard
            href="/admin/pnl"
            icon={<TrendingUpIcon className="h-[18px] w-[18px]" />}
            accent="green"
            title="PNL"
            description="Realized margin vs. supplier cost"
          />
        </div>
      </section>

      <section>
        <SectionHeader>Overview</SectionHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            href="/admin/users"
            icon={<UsersIcon className="h-[18px] w-[18px]" />}
            accent="neutral"
            title="Total Users"
            description="All registered profiles"
          >
            <p className="text-2xl font-bold">{totalUsers ?? 0}</p>
          </StatCard>
          <StatCard icon={<ClockIcon className="h-[18px] w-[18px]" />} accent="neutral" title="Last 24 hours">
            <p className="text-2xl font-bold">{last24hCount}</p>
            <p className="-mt-2 mb-1 text-xs text-foreground/50">transaction{last24hCount === 1 ? "" : "s"}</p>
            <CurrencyStatRows totals={last24hTotals} />
          </StatCard>
          <StatCard icon={<PieChartIcon className="h-[18px] w-[18px]" />} accent="neutral" title="KYC approval rate">
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
          </StatCard>
        </div>
      </section>
    </div>
  );
}

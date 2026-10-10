import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdminUser, getAdminRole } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Pill, statusTone, type PillTone } from "@/components/ui/Pill";
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
  TransactionsIcon,
} from "@/components/layout/NavIcons";
import { formatBalance } from "@/lib/currency";
import { sumByCurrency } from "@/lib/admin/aggregate";
import { ledgerKindLabel } from "@/lib/admin/ledger";
import type { AdminLedgerTotal, Currency } from "@/lib/types/database";

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

// All three replace the old "fetch every matching row, sum in JS" pattern — that silently
// truncated once a currency's row count crossed Supabase's 1000-row cap, which is exactly how a
// growing business quietly stops seeing its own real totals. admin_ledger_totals (migration
// 0044) is a real SQL group-by, so there's nothing here left to truncate.
function sumAmountByStatus(totals: AdminLedgerTotal[], statuses: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of totals) {
    if (!statuses.includes(t.status)) continue;
    out.set(t.currency, (out.get(t.currency) ?? 0) + t.total_amount);
  }
  return out;
}
function sumCountByStatus(totals: AdminLedgerTotal[], statuses: string[]): number {
  return totals.filter((t) => statuses.includes(t.status)).reduce((sum, t) => sum + t.txn_count, 0);
}
function amountByKindAndCurrency(totals: AdminLedgerTotal[], kind: string, statuses: string[]): Map<string, number> {
  return sumAmountByStatus(totals.filter((t) => t.kind === kind), statuses);
}
function countByKind(totals: AdminLedgerTotal[], kind: string, statuses: string[]): number {
  return sumCountByStatus(totals.filter((t) => t.kind === kind), statuses);
}

function CurrencyStatRows({ totals, empty }: { totals: Map<string, number>; empty?: string }) {
  if (totals.size === 0) {
    return <p className="text-xs text-foreground/50">{empty ?? "No data yet."}</p>;
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
    { data: allTimeTotalsRaw },
    { data: last24hTotalsRaw },
    { data: wallets },
    { data: recentActivity },
    approvedKyc,
    pendingKyc,
    rejectedKyc,
  ] = await Promise.all([
    getAdminRole(adminUser.id, adminUser.email),
    admin.from("profiles").select("*", { count: "exact", head: true }).eq("kyc_status", "pending"),
    countActive(admin, "rmb_manual"),
    countActive(admin, "withdrawal"),
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin.rpc("admin_ledger_totals", { p_since: null }),
    admin.rpc("admin_ledger_totals", { p_since: last24h }),
    admin.from("wallets").select("currency, balance"),
    admin.from("admin_activity_ledger").select("*").order("created_at", { ascending: false }).limit(10),
    countKycStatus(admin, "approved"),
    countKycStatus(admin, "pending"),
    countKycStatus(admin, "rejected"),
  ]);

  const allTimeTotals = allTimeTotalsRaw ?? [];
  const last24hTotals = last24hTotalsRaw ?? [];
  const balanceTotals = sumByCurrency(wallets ?? [], (w) => w.currency, (w) => w.balance);

  // "Today"/"Last 24 hours" counts and sums EVERY kind and EVERY status within the window — this
  // is the figure the client's complaint was actually about: a deposit or CNY conversion made
  // yesterday now shows up here, where before only the `transactions` table did.
  const last24hCount = sumCountByStatus(last24hTotals, ["pending", "processing", "completed", "failed"]);
  const last24hCurrencyTotals = sumAmountByStatus(last24hTotals, ["pending", "processing", "completed", "failed"]);

  const CATEGORIES = [
    { kind: "deposit", title: "Deposits" },
    { kind: "swap", title: "Swaps" },
    { kind: "cny_conversion", title: "CNY conversions" },
    { kind: "china_payment", title: "Payments to China" },
    { kind: "withdrawal", title: "Withdrawals" },
  ] as const;

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Admin Dashboard</h1>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        <QuickActionTile href="/admin/kyc" icon={<ShieldCheckIcon className="h-[18px] w-[18px]" />} label="KYC Review" />
        <QuickActionTile href="/admin/rmb" icon={<ExchangeIcon className="h-[18px] w-[18px]" />} label="CNY Payment Queue" />
        <QuickActionTile href="/admin/withdrawals" icon={<WithdrawIcon className="h-[18px] w-[18px]" />} label="Withdrawals" />
        <QuickActionTile href="/admin/transactions" icon={<TransactionsIcon className="h-[18px] w-[18px]" />} label="Transactions" />
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
            title="CNY Payment Queue"
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map(({ kind, title }) => {
            const completed = amountByKindAndCurrency(allTimeTotals, kind, ["completed"]);
            const completedCount = countByKind(allTimeTotals, kind, ["completed"]);
            const awaiting = kind === "deposit" ? amountByKindAndCurrency(allTimeTotals, kind, ["pending", "processing"]) : null;
            return (
              <StatCard key={kind} icon={<ChartBarIcon className="h-[18px] w-[18px]" />} accent="green" title={title} count={completedCount} tone="success">
                <CurrencyStatRows totals={completed} empty="No completed activity yet." />
                {awaiting && awaiting.size > 0 && (
                  <div className="mt-2 border-t border-border pt-2">
                    <p className="mb-1 text-xs font-medium text-accent-700">Awaiting confirmation</p>
                    <CurrencyStatRows totals={awaiting} />
                  </div>
                )}
              </StatCard>
            );
          })}
          <StatCard icon={<TagIcon className="h-[18px] w-[18px]" />} accent="green" title="Total user balances held (owed to users)">
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

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <SectionHeader>Recent activity</SectionHeader>
          <Link href="/admin/transactions" className="text-sm font-medium text-primary-600 hover:underline">
            View all transactions
          </Link>
        </div>
        <Card className="overflow-hidden p-0">
          {!recentActivity || recentActivity.length === 0 ? (
            <p className="p-6 text-center text-sm text-foreground/50">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentActivity.map((row) => (
                <li key={`${row.source}-${row.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">{row.user_name || "—"}</span>
                    <Link href={`/admin/users/${row.user_id}`} className="truncate text-xs text-primary-600 hover:underline">
                      {row.user_email || row.user_id}
                    </Link>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-foreground/60">{ledgerKindLabel(row.kind)}</span>
                    <span className="text-sm font-medium">{formatBalance(row.currency, row.amount)}</span>
                    <Pill tone={statusTone(row.status)}>{row.status}</Pill>
                    <span className="shrink-0 text-xs text-foreground/40">{new Date(row.created_at).toLocaleDateString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
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
            <p className="-mt-2 mb-1 text-xs text-foreground/50">
              deposit{last24hCount === 1 ? "" : "s"}, swap{last24hCount === 1 ? "" : "s"}, conversions & more
            </p>
            <CurrencyStatRows totals={last24hCurrencyTotals} />
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

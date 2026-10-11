import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency, SupplierRate } from "@/lib/types/database";
import { formatBalance } from "@/lib/currency";
import { usdtRateAt } from "@/lib/admin/supplierRate";

// Every realized-PNL figure here is expressed in USDT, because that's the one unit every route
// (CNY conversions started in any currency, USDT/fiat swaps, withdrawal fees in any currency, Pay
// to China requests) can be added to or compared against directly. See admin/pnl/page.tsx's
// header comment (this module's original home, before being extracted so admin/page.tsx's home
// dashboard could show the same total without duplicating ~150 lines of this math) for the two
// unit-mismatch bugs that made that discipline necessary in the first place.
export const FIAT_CURRENCIES: Currency[] = ["NGN", "KES", "GHS"];

const FETCH_PAGE_SIZE = 1000;
async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + FETCH_PAGE_SIZE - 1);
    if (error) {
      console.error("[admin/pnl] paginated fetch failed", error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }
  return all;
}

function numberLabel(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export interface RouteStat {
  route: string;
  volumeCurrency: Currency;
  volume: number;
  pnlUsdt: number;
  skipped: number;
  // Set for a route whose skip count is informational only (e.g. a CNY-sourced Pay to China spend
  // already counted when the CNY was converted) — rendered as a note instead of a warning.
  note?: string;
}

function addVolumeAndPnl(stats: Map<string, RouteStat>, route: string, volumeCurrency: Currency, volume: number, pnlUsdt: number) {
  const entry = stats.get(route) ?? { route, volumeCurrency, volume: 0, pnlUsdt: 0, skipped: 0 };
  entry.volume += volume;
  entry.pnlUsdt += pnlUsdt;
  stats.set(route, entry);
}
function addSkipped(stats: Map<string, RouteStat>, route: string, volumeCurrency: Currency) {
  const entry = stats.get(route) ?? { route, volumeCurrency, volume: 0, pnlUsdt: 0, skipped: 0 };
  entry.skipped += 1;
  stats.set(route, entry);
}
function addNote(stats: Map<string, RouteStat>, route: string, volumeCurrency: Currency, note: string) {
  const entry = stats.get(route) ?? { route, volumeCurrency, volume: 0, pnlUsdt: 0, skipped: 0 };
  entry.note = note;
  stats.set(route, entry);
}

export interface PerOrderRow {
  createdAt: string;
  route: string;
  paidLabel: string;
  gotLabel: string;
  customerRateLabel: string;
  supplierRateLabel: string;
  pnlUsdt: number | null;
  // True when pnlUsdt was computed using a fallback (earliest-on-file, not the rate actually in
  // effect at the time) supplier rate — see usdtRateAt's header comment.
  estimated?: boolean;
}

export interface AdminPnlResult {
  supplierRates: SupplierRate[];
  markupRate: { fiat_markup_rate: number; usdt_markup_rate: number } | null;
  conversionPnlUsdt: number;
  swapPnlUsdt: number;
  withdrawalFeesUsdt: number;
  payToChinaPnlUsdt: number;
  totalPnlUsdt: number;
  conversionSkipped: number;
  swapSkipped: number;
  withdrawalSkipped: number;
  payToChinaSkipped: number;
  payToChinaCnySourceCount: number;
  totalSkipped: number;
  // Orders whose PNL used a fallback supplier rate (see usdtRateAt) rather than the rate actually
  // in effect at the time — counted (not skipped), but worth surfacing as an estimate.
  totalEstimated: number;
  routeResults: RouteStat[];
  perOrderRows: PerOrderRow[];
}

// Shared by src/app/admin/pnl/page.tsx (the full breakdown) and src/app/admin/page.tsx (just the
// totalPnlUsdt figure on the home dashboard's PNL card) — a single admin-gated client plus one
// `periodCutoff` (null for all time) is enough for both callers.
export async function computeAdminPnl(
  admin: ReturnType<typeof createAdminClient>,
  periodCutoff: string | null,
): Promise<AdminPnlResult> {
  const [{ data: supplierRatesRaw }, { data: markupRateRaw }, cnyConversions, swaps, withdrawals, payToChina] = await Promise.all([
    admin.from("supplier_rates").select("*").order("effective_from", { ascending: false }),
    admin.from("cny_markup_rate").select("fiat_markup_rate, usdt_markup_rate").maybeSingle(),
    fetchAllRows<{
      from_currency: Currency;
      from_amount: number;
      to_currency: Currency;
      to_amount: number;
      busha_rate: number | null;
      created_at: string;
    }>((from, to) => {
      let q = admin
        .from("cny_conversions")
        .select("from_currency, from_amount, to_currency, to_amount, busha_rate, created_at")
        .order("created_at", { ascending: false });
      if (periodCutoff) q = q.gte("created_at", periodCutoff);
      return q.range(from, to);
    }),
    fetchAllRows<{
      currency: Currency;
      amount: number;
      target_currency: Currency | null;
      target_amount: number | null;
      created_at: string;
    }>((from, to) => {
      let q = admin
        .from("transactions")
        .select("currency, amount, target_currency, target_amount, created_at")
        .eq("type", "usdt_ngn")
        .eq("status", "completed")
        .not("target_amount", "is", null)
        .order("created_at", { ascending: false });
      if (periodCutoff) q = q.gte("created_at", periodCutoff);
      return q.range(from, to);
    }),
    fetchAllRows<{
      currency: Currency;
      amount: number;
      target_amount: number | null;
      created_at: string;
    }>((from, to) => {
      let q = admin
        .from("transactions")
        .select("currency, amount, target_amount, created_at")
        .eq("type", "withdrawal")
        .eq("status", "completed")
        .not("target_amount", "is", null)
        .order("created_at", { ascending: false });
      if (periodCutoff) q = q.gte("created_at", periodCutoff);
      return q.range(from, to);
    }),
    // Pay to China (Send to China) requests — type 'rmb_manual', only ever counted once
    // completed. target_amount here is the CNY actually delivered (migration 0045's
    // create_rmb_manual_transaction_v2 is the only path that populates it; older requests made
    // before that migration, or ones that fell back to v1, have target_amount null and are
    // counted as skipped below, never silently as zero).
    fetchAllRows<{
      id: string;
      currency: Currency;
      amount: number;
      target_amount: number | null;
      created_at: string;
    }>((from, to) => {
      let q = admin
        .from("transactions")
        .select("id, currency, amount, target_amount, created_at")
        .eq("type", "rmb_manual")
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      if (periodCutoff) q = q.gte("created_at", periodCutoff);
      return q.range(from, to);
    }),
  ]);

  const rates = supplierRatesRaw ?? [];
  const markupRate = markupRateRaw ?? null;

  const routeStats = new Map<string, RouteStat>();
  const perOrderRows: PerOrderRow[] = [];
  let conversionPnlUsdt = 0;
  let swapPnlUsdt = 0;
  let withdrawalFeesUsdt = 0;
  let payToChinaPnlUsdt = 0;
  let conversionSkipped = 0;
  let swapSkipped = 0;
  let withdrawalSkipped = 0;
  let payToChinaSkipped = 0;
  let payToChinaCnySourceCount = 0;
  let totalEstimated = 0;

  // ── CNY conversions ──────────────────────────────────────────────────────────────────────
  for (const row of cnyConversions) {
    const isFromCny = row.from_currency === "CNY";
    const nonCnyCurrency = isFromCny ? row.to_currency : row.from_currency;
    if (nonCnyCurrency === "CNY") continue;
    const route = `${nonCnyCurrency} to CNY`;

    const nonCnyAmount = isFromCny ? row.to_amount : row.from_amount;
    const cnyAmount = isFromCny ? row.from_amount : row.to_amount;
    const customerRate = cnyAmount / nonCnyAmount;

    const usdtValue = nonCnyCurrency === "USDT" ? nonCnyAmount : row.busha_rate != null ? nonCnyAmount * row.busha_rate : null;
    const supplierRateLookup = usdtRateAt(rates, "CNY", row.created_at);

    const supplierRateLabel = supplierRateLookup != null ? `${numberLabel(supplierRateLookup.rate)} CNY/USDT` : "No rate on file";
    const paidLabel = formatBalance(row.from_currency, row.from_amount);
    const gotLabel = formatBalance(row.to_currency, row.to_amount);
    const customerRateLabel = `${numberLabel(customerRate)} CNY/${nonCnyCurrency}`;

    if (usdtValue == null || supplierRateLookup == null) {
      conversionSkipped += 1;
      addSkipped(routeStats, route, nonCnyCurrency);
      perOrderRows.push({ createdAt: row.created_at, route, paidLabel, gotLabel, customerRateLabel, supplierRateLabel, pnlUsdt: null });
      continue;
    }
    if (supplierRateLookup.estimated) totalEstimated += 1;

    const cnyCostUsdt = cnyAmount / supplierRateLookup.rate;
    const pnlUsdt = isFromCny ? cnyCostUsdt - usdtValue : usdtValue - cnyCostUsdt;
    conversionPnlUsdt += pnlUsdt;
    addVolumeAndPnl(routeStats, route, nonCnyCurrency, nonCnyAmount, pnlUsdt);
    perOrderRows.push({
      createdAt: row.created_at,
      route,
      paidLabel,
      gotLabel,
      customerRateLabel,
      supplierRateLabel,
      pnlUsdt,
      estimated: supplierRateLookup.estimated,
    });
  }

  // ── USDT/fiat swaps ──────────────────────────────────────────────────────────────────────
  for (const row of swaps) {
    if (row.target_currency == null || row.target_amount == null) continue;
    const isSourceUsdt = row.currency === "USDT";
    const fiatCurrency = isSourceUsdt ? row.target_currency : row.currency;
    if (fiatCurrency === "USDT") continue;
    const route = `USDT to ${fiatCurrency}`;

    const customerRate = isSourceUsdt ? row.target_amount / row.amount : row.amount / row.target_amount;
    const usdtAmount = isSourceUsdt ? row.amount : row.target_amount;
    const supplierRateLookup = usdtRateAt(rates, fiatCurrency, row.created_at);

    const supplierRateLabel = supplierRateLookup != null ? `${numberLabel(supplierRateLookup.rate)} ${fiatCurrency}/USDT` : "No rate on file";
    const paidLabel = formatBalance(row.currency, row.amount);
    const gotLabel = formatBalance(row.target_currency, row.target_amount);
    const customerRateLabel = `${numberLabel(customerRate)} ${fiatCurrency}/USDT`;

    if (supplierRateLookup == null) {
      swapSkipped += 1;
      addSkipped(routeStats, route, "USDT");
      perOrderRows.push({ createdAt: row.created_at, route, paidLabel, gotLabel, customerRateLabel, supplierRateLabel, pnlUsdt: null });
      continue;
    }
    if (supplierRateLookup.estimated) totalEstimated += 1;

    const pnlLocal = isSourceUsdt
      ? (supplierRateLookup.rate - customerRate) * usdtAmount
      : (customerRate - supplierRateLookup.rate) * usdtAmount;
    const pnlUsdt = pnlLocal / supplierRateLookup.rate;
    swapPnlUsdt += pnlUsdt;
    addVolumeAndPnl(routeStats, route, "USDT", usdtAmount, pnlUsdt);
    perOrderRows.push({
      createdAt: row.created_at,
      route,
      paidLabel,
      gotLabel,
      customerRateLabel,
      supplierRateLabel,
      pnlUsdt,
      estimated: supplierRateLookup.estimated,
    });
  }

  // ── Withdrawal fees ──────────────────────────────────────────────────────────────────────
  for (const row of withdrawals) {
    if (row.target_amount == null) continue;
    const fee = row.amount - row.target_amount;
    const route = `withdrawals ${row.currency}`;
    const isUsdt = row.currency === "USDT";
    const supplierRateLookup = isUsdt ? null : usdtRateAt(rates, row.currency, row.created_at);

    const paidLabel = formatBalance(row.currency, row.amount);
    const gotLabel = formatBalance(row.currency, row.target_amount);
    const supplierRateLabel = isUsdt
      ? "—"
      : supplierRateLookup != null
        ? `${numberLabel(supplierRateLookup.rate)} ${row.currency}/USDT`
        : "No rate on file";

    if (!isUsdt && supplierRateLookup == null) {
      withdrawalSkipped += 1;
      addSkipped(routeStats, route, row.currency);
      perOrderRows.push({ createdAt: row.created_at, route, paidLabel, gotLabel, customerRateLabel: "1% fee", supplierRateLabel, pnlUsdt: null });
      continue;
    }
    if (supplierRateLookup?.estimated) totalEstimated += 1;

    const usdtFee = isUsdt ? fee : fee / supplierRateLookup!.rate;
    withdrawalFeesUsdt += usdtFee;
    addVolumeAndPnl(routeStats, route, row.currency, row.amount, usdtFee);
    perOrderRows.push({
      createdAt: row.created_at,
      route,
      paidLabel,
      gotLabel,
      customerRateLabel: "1% fee",
      supplierRateLabel,
      pnlUsdt: usdtFee,
      estimated: supplierRateLookup?.estimated,
    });
  }

  // ── Pay to China (Send to China) ────────────────────────────────────────────────────────
  // amount is what the customer was debited in `currency`; target_amount is the CNY actually
  // delivered (only populated for requests created after migration 0045). cnyCostUsdt is what
  // that CNY would have cost at the USDT/CNY supplier rate; revenueUsdt is the customer-debited
  // amount in USDT terms. The difference is this order's PNL — same "convert everything to USDT,
  // never compare a CNY rate to a USDT rate directly" discipline as the CNY conversions loop
  // above, since a Pay to China request IS effectively a CNY conversion followed by an immediate
  // spend, just recorded as a single transactions row instead of two.
  for (const row of payToChina) {
    const route = `${row.currency} to CNY (Pay to China)`;

    if (row.currency === "CNY") {
      // Spent from an already-locked CNY balance — that balance's PNL was already realized when
      // the CNY conversion itself happened (the cny_conversions loop above), so counting it again
      // here would double count it. Informational note, not a skip warning: nothing is actually
      // missing from this total.
      payToChinaCnySourceCount += 1;
      addNote(
        routeStats,
        route,
        "CNY",
        "Spent from a locked CNY balance — its PNL was already counted when that CNY was converted, not counted again here.",
      );
      continue;
    }

    const paidLabel = formatBalance(row.currency, row.amount);
    const gotLabel = row.target_amount != null ? formatBalance("CNY", row.target_amount) : "—";

    if (row.target_amount == null) {
      payToChinaSkipped += 1;
      addSkipped(routeStats, route, row.currency);
      perOrderRows.push({
        createdAt: row.created_at,
        route,
        paidLabel,
        gotLabel,
        customerRateLabel: "—",
        supplierRateLabel: "No CNY amount recorded (pre-migration-0045 request)",
        pnlUsdt: null,
      });
      continue;
    }

    const cnySupplierRateLookup = usdtRateAt(rates, "CNY", row.created_at);
    const customerRate = row.target_amount / row.amount;
    const customerRateLabel = `${numberLabel(customerRate)} CNY/${row.currency}`;
    const supplierRateLabel = cnySupplierRateLookup != null ? `${numberLabel(cnySupplierRateLookup.rate)} CNY/USDT` : "No rate on file";

    if (cnySupplierRateLookup == null) {
      payToChinaSkipped += 1;
      addSkipped(routeStats, route, row.currency);
      perOrderRows.push({ createdAt: row.created_at, route, paidLabel, gotLabel, customerRateLabel, supplierRateLabel, pnlUsdt: null });
      continue;
    }

    // revenueUsdt needs its own currency's supplier rate (not the CNY one) when currency isn't
    // USDT — looked up once and reused for both the skip check and the actual math, rather than
    // calling usdtRateAt twice for the same pair.
    let revenueUsdt: number;
    let revenueEstimated = false;
    if (row.currency === "USDT") {
      revenueUsdt = row.amount;
    } else {
      const revenueRateLookup = usdtRateAt(rates, row.currency, row.created_at);
      if (revenueRateLookup == null) {
        payToChinaSkipped += 1;
        addSkipped(routeStats, route, row.currency);
        perOrderRows.push({
          createdAt: row.created_at,
          route,
          paidLabel,
          gotLabel,
          customerRateLabel,
          supplierRateLabel: "No rate on file",
          pnlUsdt: null,
        });
        continue;
      }
      revenueUsdt = row.amount / revenueRateLookup.rate;
      revenueEstimated = revenueRateLookup.estimated;
    }

    const isEstimated = cnySupplierRateLookup.estimated || revenueEstimated;
    if (isEstimated) totalEstimated += 1;

    const cnyCostUsdt = row.target_amount / cnySupplierRateLookup.rate;
    const pnlUsdt = revenueUsdt - cnyCostUsdt;
    payToChinaPnlUsdt += pnlUsdt;
    addVolumeAndPnl(routeStats, route, row.currency, row.amount, pnlUsdt);
    perOrderRows.push({ createdAt: row.created_at, route, paidLabel, gotLabel, customerRateLabel, supplierRateLabel, pnlUsdt, estimated: isEstimated });
  }

  perOrderRows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const totalPnlUsdt = conversionPnlUsdt + swapPnlUsdt + withdrawalFeesUsdt + payToChinaPnlUsdt;
  const totalSkipped = conversionSkipped + swapSkipped + withdrawalSkipped + payToChinaSkipped;
  const routeResults = [...routeStats.values()].sort((a, b) => a.route.localeCompare(b.route));

  return {
    supplierRates: rates,
    markupRate,
    conversionPnlUsdt,
    swapPnlUsdt,
    withdrawalFeesUsdt,
    payToChinaPnlUsdt,
    totalPnlUsdt,
    conversionSkipped,
    swapSkipped,
    withdrawalSkipped,
    payToChinaSkipped,
    payToChinaCnySourceCount,
    totalSkipped,
    totalEstimated,
    routeResults,
    perOrderRows,
  };
}

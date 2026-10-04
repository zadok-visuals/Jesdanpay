"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/auth/admin";
import type { Currency, TransactionStatus } from "@/lib/types/database";
import { summarizeRmbRecipient } from "@/lib/rmbRecipient";
import { isMostRecentForCurrency, type UnifiedActivity } from "@/lib/transactions";

// Full detail for one row from the unified activity list (see src/lib/transactions.ts) — kept
// separate from UnifiedActivity itself so the list query stays lightweight; this is only fetched
// once a user actually opens a row's detail view. Fields not applicable to a given source/type
// are left null — TransactionDetailModal decides what to render based on `source`/`type`.
export interface ActivityDetail {
  source: UnifiedActivity["source"];
  type: string;
  status: TransactionStatus;
  createdAt: string;
  sourceAmount: number;
  sourceCurrency: Currency;
  targetAmount: number | null;
  targetCurrency: Currency | null;
  fee: number | null;
  reference: string | null;
  description: string | null;
  // Set when an admin rejected this (currently only rmb_manual — see admin_reject_rmb_transaction,
  // migration 0036, mirroring profiles.kyc_rejection_reason) so the user can see why, same as KYC
  // rejection reasons are already surfaced on the KYC status page.
  rejectionReason: string | null;
  // Only set for deposits where the amount actually confirmed on-chain (or via the payment
  // provider) differs from what was originally requested — see migration 0028.
  confirmedAmount: number | null;
  // The relevant wallet's balance at request time (destination currency for a conversion/
  // exchange, this activity's own currency for a deposit/withdrawal) — null only if the wallet
  // row itself couldn't be found. isMostRecent decides the row's label: "New balance" when
  // nothing else has touched that currency since, "Current balance" otherwise (a later
  // transaction already moved it further, so this number is no longer a fresh snapshot).
  balanceAfter: number | null;
  isMostRecent: boolean;
}

export interface ActivityDetailState {
  detail?: ActivityDetail;
  error?: string;
}

async function resolveBalanceInfo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  currency: Currency,
  createdAt: string,
): Promise<{ balanceAfter: number | null; isMostRecent: boolean }> {
  const [{ data: wallet }, isMostRecent] = await Promise.all([
    supabase.from("wallets").select("balance").eq("user_id", userId).eq("currency", currency).maybeSingle(),
    isMostRecentForCurrency(supabase, userId, currency, createdAt),
  ]);
  return { balanceAfter: wallet?.balance ?? null, isMostRecent };
}

export async function getActivityDetail(
  source: UnifiedActivity["source"],
  id: string,
): Promise<ActivityDetailState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (source === "deposit") {
    const { data, error } = await supabase
      .from("deposits")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: "Deposit not found." };
    const { balanceAfter, isMostRecent } = await resolveBalanceInfo(supabase, user.id, data.currency, data.created_at);
    return {
      detail: {
        source: "deposit",
        type: "deposit",
        status: data.status,
        createdAt: data.created_at,
        sourceAmount: data.amount,
        sourceCurrency: data.currency,
        targetAmount: null,
        targetCurrency: null,
        fee: null,
        reference: data.provider_reference,
        description: null,
        rejectionReason: null,
        confirmedAmount: data.confirmed_amount,
        balanceAfter,
        isMostRecent,
      },
    };
  }

  if (source === "cny_conversion") {
    const { data, error } = await supabase
      .from("cny_conversions")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: "Conversion not found." };
    const { balanceAfter, isMostRecent } = await resolveBalanceInfo(supabase, user.id, data.to_currency, data.created_at);
    return {
      detail: {
        source: "cny_conversion",
        type: `convert_${data.direction}`,
        status: "completed",
        createdAt: data.created_at,
        sourceAmount: data.from_amount,
        sourceCurrency: data.from_currency,
        targetAmount: data.to_amount,
        targetCurrency: data.to_currency,
        fee: null,
        reference: null,
        description: data.direction === "to_cny" ? "Converted to CNY" : "Converted from CNY",
        rejectionReason: null,
        confirmedAmount: null,
        balanceAfter,
        isMostRecent,
      },
    };
  }

  const { data: tx, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!tx) return { error: "Transaction not found." };

  let description: string | null = null;
  let fee: number | null = null;

  if (tx.type === "rmb_manual" || tx.type === "rmb_auto") {
    const { data: recipient } = await supabase
      .from("rmb_recipients")
      .select("*")
      .eq("transaction_id", tx.id)
      .maybeSingle();
    description = recipient ? summarizeRmbRecipient(recipient) : null;
  } else if (tx.type === "withdrawal") {
    // BUG: since migration 0031, a user can have one withdrawal_recipients row PER CURRENCY —
    // this lookup was missing a currency filter, so a user with recipients for multiple
    // currencies could see e.g. their NGN bank details on a USDT withdrawal's receipt (whichever
    // row happened to come back first/last). Filter by this transaction's own currency.
    const { data: recipient } = await supabase
      .from("withdrawal_recipients")
      .select("*")
      .eq("user_id", user.id)
      .eq("currency", tx.currency)
      .maybeSingle();
    description = recipient
      ? recipient.wallet_address
        ? `USDT (BSC) · ${recipient.wallet_address}`
        : `${recipient.bank_name} · ${recipient.bank_account_number} · ${recipient.account_holder_name}`
      : null;
    if (tx.target_amount != null) fee = tx.amount - tx.target_amount;
  } else if (tx.type === "usdt_ngn") {
    description = "USDT exchange";
  }

  const resolvedTargetAmount = tx.actual_target_amount ?? tx.target_amount;
  // Same conversion-vs-withdrawal test the modal itself applies to decide whether to show a
  // target-amount row at all — reused here so the balance lookup targets the same currency the
  // modal is actually describing as "the" relevant one for this row.
  const isConversion = tx.type !== "withdrawal" && tx.target_currency != null && resolvedTargetAmount != null;
  const relevantCurrency = isConversion ? tx.target_currency! : tx.currency;
  const { balanceAfter, isMostRecent } = await resolveBalanceInfo(supabase, user.id, relevantCurrency, tx.created_at);

  return {
    detail: {
      source: "transaction",
      type: tx.type,
      status: tx.status,
      createdAt: tx.created_at,
      sourceAmount: tx.amount,
      sourceCurrency: tx.currency,
      targetAmount: resolvedTargetAmount,
      targetCurrency: tx.target_currency,
      fee,
      reference: tx.provider_reference,
      description,
      rejectionReason: tx.rejection_reason,
      confirmedAmount: null,
      balanceAfter,
      isMostRecent,
    },
  };
}

// ---- Admin-facing: look up any user's transaction by its provider reference, for support agents
// (src/app/admin/transactions/page.tsx) who have a reference number from a user but no other way
// to find the matching record. Reuses the same ActivityDetail shape as the user-facing lookup
// above (minus balanceAfter/isMostRecent, which only make sense when resolving "my" current wallet
// state from a logged-in session) plus whoever the transaction belongs to.

export interface AdminActivityLookup extends Omit<ActivityDetail, "balanceAfter" | "isMostRecent"> {
  userId: string;
  userEmail: string;
  // Only ever set for a failed/cancelled withdrawal that went through the automated Busha payout
  // path (migration 0030) — the one place in the schema an actual provider-side failure detail is
  // captured today. Deposits currently store no equivalent detail beyond their bare `status`.
  automatedPayoutFailedReason: string | null;
}

export interface ActivityLookupState {
  result?: AdminActivityLookup;
  error?: string;
}

export async function searchActivityByReference(reference: string): Promise<ActivityLookupState> {
  await requireAdminUser();
  const trimmed = reference.trim();
  if (!trimmed) return { error: "Enter a reference number." };

  const admin = createAdminClient();
  const [{ data: deposit }, { data: tx }] = await Promise.all([
    admin.from("deposits").select("*").eq("provider_reference", trimmed).maybeSingle(),
    admin.from("transactions").select("*").eq("provider_reference", trimmed).maybeSingle(),
  ]);

  if (!deposit && !tx) return { error: `No transaction found with reference "${trimmed}".` };

  if (deposit) {
    const { data: profile } = await admin.from("profiles").select("email").eq("id", deposit.user_id).maybeSingle();
    return {
      result: {
        source: "deposit",
        type: "deposit",
        status: deposit.status,
        createdAt: deposit.created_at,
        sourceAmount: deposit.amount,
        sourceCurrency: deposit.currency,
        targetAmount: null,
        targetCurrency: null,
        fee: null,
        reference: deposit.provider_reference,
        description: null,
        rejectionReason: null,
        confirmedAmount: deposit.confirmed_amount,
        automatedPayoutFailedReason: null,
        userId: deposit.user_id,
        userEmail: profile?.email ?? "Unknown",
      },
    };
  }

  const t = tx!;
  let description: string | null = null;
  let fee: number | null = null;

  if (t.type === "rmb_manual" || t.type === "rmb_auto") {
    const { data: recipient } = await admin.from("rmb_recipients").select("*").eq("transaction_id", t.id).maybeSingle();
    description = recipient ? summarizeRmbRecipient(recipient) : null;
  } else if (t.type === "withdrawal") {
    const { data: recipient } = await admin
      .from("withdrawal_recipients")
      .select("*")
      .eq("user_id", t.user_id)
      .eq("currency", t.currency)
      .maybeSingle();
    description = recipient
      ? recipient.wallet_address
        ? `USDT (BSC) · ${recipient.wallet_address}`
        : `${recipient.bank_name} · ${recipient.bank_account_number} · ${recipient.account_holder_name}`
      : null;
    if (t.target_amount != null) fee = t.amount - t.target_amount;
  } else if (t.type === "usdt_ngn") {
    description = "USDT exchange";
  }

  const { data: profile } = await admin.from("profiles").select("email").eq("id", t.user_id).maybeSingle();

  return {
    result: {
      source: "transaction",
      type: t.type,
      status: t.status,
      createdAt: t.created_at,
      sourceAmount: t.amount,
      sourceCurrency: t.currency,
      targetAmount: t.actual_target_amount ?? t.target_amount,
      targetCurrency: t.target_currency,
      fee,
      reference: t.provider_reference,
      description,
      rejectionReason: t.rejection_reason,
      confirmedAmount: null,
      automatedPayoutFailedReason: t.automated_payout_attempt_failed_reason,
      userId: t.user_id,
      userEmail: profile?.email ?? "Unknown",
    },
  };
}

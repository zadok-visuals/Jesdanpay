"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

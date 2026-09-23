"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Currency, TransactionStatus } from "@/lib/types/database";
import { summarizeRmbRecipient } from "@/lib/rmbRecipient";
import type { UnifiedActivity } from "@/lib/transactions";

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
}

export interface ActivityDetailState {
  detail?: ActivityDetail;
  error?: string;
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
    const { data: recipient } = await supabase
      .from("withdrawal_recipients")
      .select("*")
      .eq("user_id", user.id)
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

  return {
    detail: {
      source: "transaction",
      type: tx.type,
      status: tx.status,
      createdAt: tx.created_at,
      sourceAmount: tx.amount,
      sourceCurrency: tx.currency,
      targetAmount: tx.actual_target_amount ?? tx.target_amount,
      targetCurrency: tx.target_currency,
      fee,
      reference: tx.provider_reference,
      description,
    },
  };
}

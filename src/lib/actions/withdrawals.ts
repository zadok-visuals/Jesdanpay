"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Currency } from "@/lib/types/database";

export interface WithdrawalActionState {
  error?: string;
}

export async function setWithdrawalRecipient(
  _prevState: WithdrawalActionState,
  formData: FormData,
): Promise<WithdrawalActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const currency = String(formData.get("currency") ?? "") as Currency;
  const accountHolderName = String(formData.get("accountHolderName") ?? "").trim();
  const bankAccountNumber = String(formData.get("bankAccountNumber") ?? "").trim();
  const bankName = String(formData.get("bankName") ?? "").trim();
  const walletAddress = String(formData.get("walletAddress") ?? "").trim();

  if (!accountHolderName) {
    return { error: "Account holder name is required." };
  }
  if (currency === "USDT" && !walletAddress) {
    return { error: "Wallet address is required for USDT." };
  }
  if (currency !== "USDT" && (!bankAccountNumber || !bankName)) {
    return { error: "Bank account number and bank name are required." };
  }

  const { error } = await supabase.rpc("set_withdrawal_recipient", {
    p_currency: currency,
    p_account_holder_name: accountHolderName,
    p_bank_account_number: currency === "USDT" ? null : bankAccountNumber,
    p_bank_name: currency === "USDT" ? null : bankName,
    p_wallet_address: currency === "USDT" ? walletAddress : null,
  });

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return {};
}

export interface RequestWithdrawalState {
  error?: string;
  transactionId?: string;
}

export async function requestWithdrawal(
  _prevState: RequestWithdrawalState,
  formData: FormData,
): Promise<RequestWithdrawalState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const currency = String(formData.get("currency") ?? "") as Currency;
  const amount = Number(formData.get("amount"));

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount." };
  }

  const { data: transactionId, error } = await supabase.rpc("create_withdrawal_request", {
    p_currency: currency,
    p_amount: amount,
  });

  if (error) return { error: error.message };
  revalidatePath("/accounts");
  return { transactionId: transactionId ?? undefined };
}

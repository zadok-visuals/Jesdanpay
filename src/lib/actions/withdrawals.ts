"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Currency } from "@/lib/types/database";
import { attemptAutomatedPayout } from "@/lib/withdrawals/automated-payout";

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
  const bankCode = String(formData.get("bankCode") ?? "").trim();
  const walletAddress = String(formData.get("walletAddress") ?? "").trim();

  if (!accountHolderName) {
    return { error: "Account holder name is required." };
  }
  if (currency === "USDT" && !walletAddress) {
    return { error: "Wallet address is required for USDT." };
  }
  if (currency === "KES" && !bankAccountNumber) {
    return { error: "M-Pesa phone number is required." };
  }
  if (currency === "NGN" && (!bankAccountNumber || !bankName || !bankCode)) {
    return { error: "Bank account number, bank name, and bank code are required." };
  }
  if (currency === "GHS" && (!bankAccountNumber || !bankName)) {
    return { error: "Bank account number and bank name are required." };
  }

  const { error } = await supabase.rpc("set_withdrawal_recipient", {
    p_currency: currency,
    p_account_holder_name: accountHolderName,
    p_bank_account_number: currency === "USDT" ? null : bankAccountNumber,
    p_bank_name: currency === "USDT" || currency === "KES" ? null : bankName,
    p_wallet_address: currency === "USDT" ? walletAddress : null,
    p_bank_code: currency === "NGN" ? bankCode : null,
  });

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return {};
}

export async function setWithdrawalPin(
  _prevState: WithdrawalActionState,
  formData: FormData,
): Promise<WithdrawalActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const pin = String(formData.get("pin") ?? "").trim();
  if (!/^\d{4,6}$/.test(pin)) {
    return { error: "PIN must be 4 to 6 digits." };
  }

  const { error } = await supabase.rpc("set_withdrawal_pin", { p_pin: pin });
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
  const pin = String(formData.get("pin") ?? "").trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount." };
  }
  if (!pin) {
    return { error: "Enter your withdrawal PIN." };
  }

  const { data: transactionId, error } = await supabase.rpc("create_withdrawal_request", {
    p_currency: currency,
    p_amount: amount,
    p_pin: pin,
  });

  if (error) return { error: error.message };

  if (transactionId) {
    await attemptAutomatedPayout(transactionId, user.id, currency, amount);
  }

  revalidatePath("/home");
  revalidatePath("/accounts");
  return { transactionId: transactionId ?? undefined };
}

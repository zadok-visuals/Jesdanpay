"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Currency } from "@/lib/types/database";
import { attemptAutomatedPayout } from "@/lib/withdrawals/automated-payout";

export interface WithdrawalActionState {
  error?: string;
}

// Shared per-currency field validation, reused by both first-time setup (setWithdrawalRecipient)
// and a change to an existing currency's recipient (confirmRecipientChange) — same requiredness
// rules either way, only the RPC and the gate in front of it differ.
function parseRecipientFields(
  currency: Currency,
  formData: FormData,
):
  | { error: string }
  | {
      accountHolderName: string;
      bankAccountNumber: string | null;
      bankName: string | null;
      walletAddress: string | null;
      bankCode: string | null;
    } {
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

  return {
    accountHolderName,
    bankAccountNumber: currency === "USDT" ? null : bankAccountNumber,
    bankName: currency === "USDT" || currency === "KES" ? null : bankName,
    walletAddress: currency === "USDT" ? walletAddress : null,
    bankCode: currency === "NGN" ? bankCode : null,
  };
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
  const parsed = parseRecipientFields(currency, formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.rpc("set_withdrawal_recipient", {
    p_currency: currency,
    p_account_holder_name: parsed.accountHolderName,
    p_bank_account_number: parsed.bankAccountNumber,
    p_bank_name: parsed.bankName,
    p_wallet_address: parsed.walletAddress,
    p_bank_code: parsed.bankCode,
  });

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return {};
}

export interface RequestRecipientChangeState {
  error?: string;
  requested?: boolean;
}

// Starts the change flow for an EXISTING currency's recipient — the actual password check happens
// in confirmRecipientChange below; this only marks a change as properly requested (migration 0031)
// so confirm can check it was requested recently rather than being callable cold.
export async function requestRecipientChange(currency: Currency): Promise<RequestRecipientChangeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("request_recipient_change", { p_currency: currency });
  if (error) return { error: error.message };
  return { requested: true };
}

// Password re-verification, chosen over an email OTP as the faster-to-build gate (no new
// code-storage/delivery infra needed — signInWithPassword against the user's own account IS the
// verification). A Postgres function can't check an Auth password hash, so that happens here in
// TS, immediately before the privileged confirm_recipient_change RPC call.
export async function confirmRecipientChange(
  _prevState: WithdrawalActionState,
  formData: FormData,
): Promise<WithdrawalActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect("/login");

  const currency = String(formData.get("currency") ?? "") as Currency;
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Enter your password to confirm." };

  const parsed = parseRecipientFields(currency, formData);
  if ("error" in parsed) return parsed;

  const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (authError) return { error: "Incorrect password." };

  const { error } = await supabase.rpc("confirm_recipient_change", {
    p_currency: currency,
    p_account_holder_name: parsed.accountHolderName,
    p_bank_account_number: parsed.bankAccountNumber,
    p_bank_name: parsed.bankName,
    p_wallet_address: parsed.walletAddress,
    p_bank_code: parsed.bankCode,
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

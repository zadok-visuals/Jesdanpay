"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";
import { probeFiatToUsdtRate } from "@/lib/busha/rate";
import { getPayoutChannel, createBushaRecipient, createPayoutTransfer } from "@/lib/busha/payout";

// Amounts at or below this USDT-equivalent are automated via Busha's payout API; anything above
// stays on the manual admin-approval path, now additionally gated on extra identity verification
// (see migration 0027) before an admin can mark it paid out.
const AUTOMATED_PAYOUT_USDT_THRESHOLD = 1000;

// Attempts an automated Busha payout for a withdrawal create_withdrawal_request just approved
// (wallet already debited, transaction row already inserted as pending/manual). Any failure here
// — a Busha error, an unsupported currency, missing recipient details — must never throw past
// this function: the transaction simply stays exactly as create_withdrawal_request left it, and
// falls back to the existing manual admin queue. A user's already-debited withdrawal must never
// be stranded by a payout-API hiccup.
async function attemptAutomatedPayout(transactionId: string, userId: string, currency: Currency, amount: number) {
  const admin = createAdminClient();
  try {
    // Neither the rate probe nor the recipient fetch depends on the other — kick both off
    // together instead of a fully sequential round trip. The recipient is fetched even when the
    // threshold check below ends up skipping automation entirely; that's one small wasted read
    // in the (less common) over-threshold case, worth it for cutting real latency in the common
    // under-threshold path.
    const [usdtRate, recipientResult] = await Promise.all([
      currency === "USDT" ? Promise.resolve(1) : probeFiatToUsdtRate(currency),
      admin.from("withdrawal_recipients").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    const usdtEquivalent = currency === "USDT" ? amount : amount * usdtRate;
    const recipient = recipientResult.data;

    if (usdtEquivalent > AUTOMATED_PAYOUT_USDT_THRESHOLD) {
      await admin.rpc("flag_withdrawal_for_verification", { p_transaction_id: transactionId });
      return;
    }

    if (!getPayoutChannel(currency)) return; // unsupported currency — leave for manual review
    if (!recipient) return;

    let recipientId = recipient.busha_recipient_id;
    if (!recipientId) {
      recipientId = await createBushaRecipient(currency, recipient);
      await admin.from("withdrawal_recipients").update({ busha_recipient_id: recipientId }).eq("user_id", userId);
    }

    const transfer = await createPayoutTransfer(currency, amount, recipientId);
    await admin.rpc("mark_withdrawal_processing", {
      p_transaction_id: transactionId,
      p_provider_reference: transfer.id,
    });

    // Same "complete synchronously when Busha's own response already confirms it, otherwise let
    // reconciliation catch it" pattern executeSwap already uses. funds_delivered is Busha's
    // documented terminal status for payouts/withdrawals specifically.
    if (transfer.status === "funds_delivered") {
      await admin.rpc("complete_withdrawal_payout", { p_transaction_id: transactionId });
    }
  } catch (err) {
    console.error("[attemptAutomatedPayout] automated payout failed, leaving for manual review", {
      transactionId,
      currency,
      error: err instanceof Error ? err.message : err,
    });
  }
}

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

  revalidatePath("/accounts");
  return { transactionId: transactionId ?? undefined };
}

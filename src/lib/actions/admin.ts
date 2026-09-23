"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AdminActionState {
  error?: string;
}

export async function markRmbProcessing(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");

  const admin = createAdminClient();
  const { error } = await admin
    .from("transactions")
    .update({ status: "processing" })
    .eq("id", transactionId)
    .eq("type", "rmb_manual");

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

// Records what was actually delivered to the vendor in China (via Klasha's OTC desk) so margin
// becomes computable — requested `amount` vs. `actual_target_amount`, at whatever rate the
// admin actually got. Replaces the old plain status-flip.
export async function completeRmbTransaction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");
  const actualTargetAmount = Number(formData.get("actualTargetAmount"));
  const note = String(formData.get("note") ?? "").trim();

  if (!Number.isFinite(actualTargetAmount) || actualTargetAmount <= 0) {
    return { error: "Enter the actual CNY amount delivered." };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_complete_rmb_transaction", {
    p_transaction_id: transactionId,
    p_actual_target_amount: actualTargetAmount,
    p_note: note,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

export async function rejectRmbTransaction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_reject_rmb_transaction", {
    p_transaction_id: transactionId,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

export async function approveKyc(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const userId = String(formData.get("userId") ?? "");

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_approve_kyc", { p_user_id: userId });

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

export async function rejectKyc(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const userId = String(formData.get("userId") ?? "");

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_reject_kyc", { p_user_id: userId });

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

export async function completeWithdrawal(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_complete_withdrawal", { p_transaction_id: transactionId });

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

export async function rejectWithdrawal(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_reject_withdrawal", { p_transaction_id: transactionId });

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

// Above-threshold withdrawals (see AUTOMATED_PAYOUT_USDT_THRESHOLD in
// src/lib/actions/withdrawals.ts) can't be marked paid out until this runs — the exact
// verification mechanism (re-uploaded ID, video call, OTP) is still TBD with the client, so this
// only records that the admin confirmed it happened out-of-band, same "gate it, don't fake it"
// approach already used for changing a saved withdrawal recipient.
export async function confirmWithdrawalVerification(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin_user = await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_confirm_withdrawal_verification", {
    p_transaction_id: transactionId,
    p_admin_id: admin_user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

export async function setCnyMarkupRate(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const fiatMarkupPercent = Number(formData.get("fiatMarkupPercent"));
  const usdtMarkupPercent = Number(formData.get("usdtMarkupPercent"));

  if (!Number.isFinite(fiatMarkupPercent) || fiatMarkupPercent < 0 || fiatMarkupPercent >= 100) {
    return { error: "Enter a valid fiat markup percentage (0-99)." };
  }
  if (!Number.isFinite(usdtMarkupPercent) || usdtMarkupPercent < 0 || usdtMarkupPercent >= 100) {
    return { error: "Enter a valid USDT markup percentage (0-99)." };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_cny_markup_rate", {
    p_fiat_markup_rate: fiatMarkupPercent / 100,
    p_usdt_markup_rate: usdtMarkupPercent / 100,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

export async function setCnyTierRate(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const tierMin = Number(formData.get("tierMin"));
  const cnyRate = Number(formData.get("cnyRate"));

  if (!Number.isFinite(cnyRate) || cnyRate <= 0) {
    return { error: "Enter a valid rate." };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_cny_tier_rate", {
    p_tier_min: tierMin,
    p_cny_rate: cnyRate,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

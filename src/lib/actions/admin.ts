"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types/database";

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

export async function setFxRate(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const sourceCurrency = String(formData.get("sourceCurrency") ?? "");
  const cnyRate = Number(formData.get("cnyRate"));

  if (!Number.isFinite(cnyRate) || cnyRate <= 0) {
    return { error: "Enter a valid rate." };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_fx_rate", {
    p_source_currency: sourceCurrency as Currency,
    p_cny_rate: cnyRate,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

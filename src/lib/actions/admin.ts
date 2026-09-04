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

export async function markRmbCompleted(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");

  const admin = createAdminClient();
  const { error } = await admin
    .from("transactions")
    .update({ status: "completed" })
    .eq("id", transactionId)
    .eq("type", "rmb_manual");

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

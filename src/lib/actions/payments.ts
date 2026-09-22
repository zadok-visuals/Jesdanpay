"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Currency, PayoutMethod, RmbRecipient } from "@/lib/types/database";

export interface PaymentsActionState {
  error?: string;
  transactionId?: string;
}

async function uploadRecipientQrCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  file: File,
) {
  const path = `${userId}/qr-${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("rmb-recipient-qr").upload(path, file);
  if (error) throw error;
  return path;
}

export async function submitRmbExchange(
  _prevState: PaymentsActionState,
  formData: FormData,
): Promise<PaymentsActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const payoutMethod = String(formData.get("payoutMethod") ?? "") as PayoutMethod;
  const sourceCurrency = String(formData.get("sourceCurrency") ?? "") as Currency;
  const amount = Number(formData.get("amount"));
  const qrCodeFile = formData.get("qrCodeFile") as File | null;
  const saveRecipient = formData.get("saveRecipient") === "true";
  const saveLabel = String(formData.get("saveLabel") ?? "").trim();

  if (!["alipay", "wechat", "bank"].includes(payoutMethod)) {
    return { error: "Invalid payout method." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount." };
  }
  if (saveRecipient && !saveLabel) {
    return { error: "Give this saved recipient a name." };
  }

  let qrCodeRef: string | undefined;
  if (qrCodeFile && qrCodeFile.size > 0) {
    try {
      qrCodeRef = await uploadRecipientQrCode(supabase, user.id, qrCodeFile);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not upload the QR code image." };
    }
  }

  let recipientInsert: Partial<RmbRecipient> & Pick<RmbRecipient, "user_id" | "payout_method"> = {
    user_id: user.id,
    payout_method: payoutMethod,
    qr_code_ref: qrCodeRef,
  };

  if (payoutMethod === "alipay") {
    const alipayId = String(formData.get("recipientAlipayId") ?? "").trim();
    if (!alipayId && !qrCodeRef) return { error: "Recipient Alipay ID or a QR code is required." };
    recipientInsert = { ...recipientInsert, recipient_alipay_id: alipayId || null };
  } else if (payoutMethod === "wechat") {
    const wechatId = String(formData.get("recipientWechatId") ?? "").trim();
    if (!wechatId && !qrCodeRef) return { error: "Recipient WeChat Pay ID or a QR code is required." };
    recipientInsert = { ...recipientInsert, recipient_wechat_id: wechatId || null };
  } else {
    const accountNumber = String(formData.get("recipientBankAccountNumber") ?? "").trim();
    const bankName = String(formData.get("recipientBankName") ?? "").trim();
    const accountHolder = String(formData.get("recipientAccountHolderName") ?? "").trim();
    if (!accountNumber || !bankName || !accountHolder) {
      return { error: "All three bank account fields are required." };
    }
    recipientInsert = {
      ...recipientInsert,
      recipient_bank_account_number: accountNumber,
      recipient_bank_name: bankName,
      recipient_account_holder_name: accountHolder,
    };
  }

  const { data: recipient, error: recipientError } = await supabase
    .from("rmb_recipients")
    .insert(recipientInsert)
    .select("id")
    .single();
  if (recipientError) return { error: recipientError.message };

  const { data: transactionId, error: rpcError } = await supabase.rpc(
    "create_rmb_manual_transaction",
    { p_recipient_id: recipient.id, p_currency: sourceCurrency, p_amount: amount },
  );

  if (rpcError) {
    // Keep the recipients table clean if the transaction couldn't be created.
    await supabase.from("rmb_recipients").delete().eq("id", recipient.id);
    return { error: rpcError.message };
  }

  if (saveRecipient) {
    await supabase.from("saved_rmb_recipients").insert({
      user_id: user.id,
      label: saveLabel,
      payout_method: payoutMethod,
      recipient_alipay_id: recipientInsert.recipient_alipay_id ?? null,
      recipient_wechat_id: recipientInsert.recipient_wechat_id ?? null,
      recipient_bank_account_number: recipientInsert.recipient_bank_account_number ?? null,
      recipient_bank_name: recipientInsert.recipient_bank_name ?? null,
      recipient_account_holder_name: recipientInsert.recipient_account_holder_name ?? null,
      qr_code_ref: qrCodeRef ?? null,
    });
    // Best-effort — a failed save shouldn't fail the transfer that already succeeded above.
  }

  return { transactionId: transactionId ?? undefined };
}

export interface CnyConvertActionState {
  error?: string;
  conversionId?: string;
}

export async function convertToCny(
  _prevState: CnyConvertActionState,
  formData: FormData,
): Promise<CnyConvertActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sourceCurrency = String(formData.get("sourceCurrency") ?? "") as Currency;
  const amount = Number(formData.get("amount"));

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount." };
  }

  const { data: conversionId, error } = await supabase.rpc("convert_to_cny_locked", {
    p_source_currency: sourceCurrency,
    p_source_amount: amount,
  });

  if (error) return { error: error.message };
  return { conversionId: conversionId ?? undefined };
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PayoutMethod } from "@/lib/types/database";

export interface PaymentsActionState {
  error?: string;
  recipientId?: string;
}

export async function saveRmbRecipient(
  _prevState: PaymentsActionState,
  formData: FormData,
): Promise<PaymentsActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const payoutMethod = String(formData.get("payoutMethod") ?? "") as PayoutMethod;

  // Validate method
  if (!["alipay", "wechat", "bank"].includes(payoutMethod)) {
    return { error: "Invalid payout method." };
  }

  // Per-method field validation
  if (payoutMethod === "alipay") {
    const alipayId = String(formData.get("recipientAlipayId") ?? "").trim();
    if (!alipayId) return { error: "Recipient Alipay ID is required." };

    const { data, error } = await supabase
      .from("rmb_recipients")
      .insert({ user_id: user.id, payout_method: "alipay", recipient_alipay_id: alipayId })
      .select("id")
      .single();
    if (error) return { error: error.message };
    return { recipientId: data.id };
  }

  if (payoutMethod === "wechat") {
    const wechatId = String(formData.get("recipientWechatId") ?? "").trim();
    if (!wechatId) return { error: "Recipient WeChat Pay ID is required." };

    const { data, error } = await supabase
      .from("rmb_recipients")
      .insert({ user_id: user.id, payout_method: "wechat", recipient_wechat_id: wechatId })
      .select("id")
      .single();
    if (error) return { error: error.message };
    return { recipientId: data.id };
  }

  // bank
  const accountNumber = String(formData.get("recipientBankAccountNumber") ?? "").trim();
  const bankName = String(formData.get("recipientBankName") ?? "").trim();
  const accountHolder = String(formData.get("recipientAccountHolderName") ?? "").trim();

  if (!accountNumber || !bankName || !accountHolder) {
    return { error: "All three bank account fields are required." };
  }

  const { data, error } = await supabase
    .from("rmb_recipients")
    .insert({
      user_id: user.id,
      payout_method: "bank",
      recipient_bank_account_number: accountNumber,
      recipient_bank_name: bankName,
      recipient_account_holder_name: accountHolder,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { recipientId: data.id };
}

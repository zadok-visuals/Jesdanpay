"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Currency, PayoutMethod, RmbRecipient } from "@/lib/types/database";

export interface PaymentsActionState {
  error?: string;
  transactionId?: string;
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

  if (!["alipay", "wechat", "bank"].includes(payoutMethod)) {
    return { error: "Invalid payout method." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount." };
  }

  let recipientInsert: Partial<RmbRecipient> & Pick<RmbRecipient, "user_id" | "payout_method"> = {
    user_id: user.id,
    payout_method: payoutMethod,
  };

  if (payoutMethod === "alipay") {
    const alipayId = String(formData.get("recipientAlipayId") ?? "").trim();
    if (!alipayId) return { error: "Recipient Alipay ID is required." };
    recipientInsert = { ...recipientInsert, recipient_alipay_id: alipayId };
  } else if (payoutMethod === "wechat") {
    const wechatId = String(formData.get("recipientWechatId") ?? "").trim();
    if (!wechatId) return { error: "Recipient WeChat Pay ID is required." };
    recipientInsert = { ...recipientInsert, recipient_wechat_id: wechatId };
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

  return { transactionId: transactionId ?? undefined };
}

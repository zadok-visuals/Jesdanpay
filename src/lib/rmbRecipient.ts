import type { RmbRecipient } from "@/lib/types/database";

// Shared between the admin queue (src/app/admin/page.tsx) and the transaction detail view
// (src/lib/actions/activity.ts) — one place to describe an RMB recipient as a single line.
export function summarizeRmbRecipient(recipient: Pick<
  RmbRecipient,
  "payout_method" | "recipient_alipay_id" | "recipient_wechat_id" | "recipient_first_name" |
  "recipient_last_name" | "qr_code_ref" | "recipient_bank_name" | "recipient_bank_account_number" |
  "recipient_account_holder_name"
>): string {
  if (recipient.payout_method === "alipay" || recipient.payout_method === "wechat") {
    const id = recipient.payout_method === "alipay" ? recipient.recipient_alipay_id : recipient.recipient_wechat_id;
    const contact = id || (recipient.qr_code_ref ? "QR code uploaded" : "—");
    const name = [recipient.recipient_first_name, recipient.recipient_last_name].filter(Boolean).join(" ");
    return name ? `${name} · ${contact}` : contact;
  }
  return `${recipient.recipient_bank_name} · ${recipient.recipient_bank_account_number} · ${recipient.recipient_account_holder_name}`;
}

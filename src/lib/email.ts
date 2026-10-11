import { Resend } from "resend";
import { adminEmails } from "@/lib/auth/admin";

const FROM_ADDRESS = "JesDanPay <notifications@jesdanpay.net>";

// Every notification-style email below returns this instead of throwing or going silent — so a
// caller (ultimately an admin, via notifyUser/the compose action in src/lib/actions/admin.ts) can
// tell the difference between "sent" and "saved the notification, but the email itself didn't go
// out, here's why" rather than just assuming success.
export interface EmailResult {
  sent: boolean;
  reason?: string;
}

// Only the customer-facing HTML email body below ever interpolates a user-supplied value
// (full_name) — sendKycSubmissionAlert's text-only admin alert doesn't need this.
function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Shared by both support-chat email alerts below — a message body can be arbitrarily long, and
// neither admin needs (nor should get, for the user-facing reply) the full thread dropped into
// their inbox, just enough to know there's something to go look at.
function truncateMessage(body: string, maxLength = 500): string {
  const trimmed = body.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}…` : trimmed;
}

// Fire-and-forget admin alert for a new KYC submission (src/lib/actions/kyc.ts). Never throws —
// a missing/invalid RESEND_API_KEY, Resend being down, or notifications@jesdanpay.net's domain
// not yet being verified in Resend's dashboard (a manual step outside this codebase) must never
// block or fail the KYC submission itself, only get logged for someone to notice separately.
export async function sendKycSubmissionAlert(params: { userName: string; userEmail: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[kyc email alert] RESEND_API_KEY is not configured — skipping admin notification email");
    return;
  }

  const recipients = adminEmails();
  if (recipients.length === 0) return;

  try {
    const resend = new Resend(apiKey);
    // Server-only — never read in client code, so no NEXT_PUBLIC_ prefix is needed, matching
    // src/lib/actions/klasha.ts's same APP_URL convention.
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: recipients,
      subject: "New KYC submission on JesDanPay",
      text: `${params.userName} (${params.userEmail}) just submitted KYC documents for review.\n\nReview it here: ${appUrl}/admin/kyc`,
    });
    if (error) {
      console.error("[kyc email alert] Resend returned an error", error);
    }
  } catch (err) {
    console.error("[kyc email alert] failed to send via Resend", err);
  }
}

// Fire-and-forget approval notification for the customer (src/lib/actions/admin.ts's
// approveKyc, called only on a real not-approved -> approved transition). Same never-throws,
// skip-quietly-without-RESEND_API_KEY discipline as sendKycSubmissionAlert above — the approval
// itself has already taken effect in the database by the time this runs, so a failed send here
// must never undo or block it, only get logged for someone to notice separately.
export async function sendKycApprovedEmail(params: { userName: string; userEmail: string }): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const reason = "RESEND_API_KEY is not configured";
    console.warn(`[email] ${reason} — skipping KYC approval email`);
    return { sent: false, reason };
  }

  try {
    const resend = new Resend(apiKey);
    // Server-only — never read in client code, same APP_URL convention as sendKycSubmissionAlert
    // above and src/lib/actions/klasha.ts.
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const homeUrl = `${appUrl}/home`;
    const safeName = escapeHtml(params.userName);

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.userEmail,
      subject: "Your JesDanPay verification is approved",
      text: `Hi ${params.userName},\n\nYour identity verification is approved. You now have full access to your JesDanPay account — all your transaction limits are unlocked.\n\nGo to your dashboard: ${homeUrl}`,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717;max-width:480px;margin:0 auto;">
  <p>Hi ${safeName},</p>
  <p>Your identity verification is approved. You now have full access to your JesDanPay account — all your transaction limits are unlocked.</p>
  <p style="margin:24px 0;">
    <a href="${homeUrl}" style="display:inline-block;background:#1b7a4b;color:#ffffff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:500;">Go to your dashboard</a>
  </p>
</div>`,
    });
    if (error) {
      console.error("[email] kyc approved: Resend returned an error", error);
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error sending email";
    console.error("[email] kyc approved: failed to send via Resend", err);
    return { sent: false, reason };
  }
}

// Fire-and-forget completion notice for the customer (src/lib/actions/admin.ts's
// completeRmbTransaction). Same never-throws, skip-quietly-without-RESEND_API_KEY discipline as
// the KYC emails above — the completion itself has already taken effect by the time this runs.
export async function sendRmbCompletedEmail(params: {
  userName: string;
  userEmail: string;
  debitedAmount: number;
  debitedCurrency: string;
  deliveredAmount: number;
  recipientName: string | null;
  reference: string;
  hasProof: boolean;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const reason = "RESEND_API_KEY is not configured";
    console.warn(`[email] ${reason} — skipping RMB completion email`);
    return { sent: false, reason };
  }

  try {
    const resend = new Resend(apiKey);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const transactionsUrl = `${appUrl}/transactions`;
    const safeName = escapeHtml(params.userName);
    const debitedText = `${params.debitedCurrency} ${params.debitedAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const cnyText = `¥${params.deliveredAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const shortRef = params.reference.slice(0, 8);
    const dateText = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const proofLine = params.hasProof ? " Proof of payment is available in your notifications." : "";
    const safeRecipient = params.recipientName ? escapeHtml(params.recipientName) : null;

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.userEmail,
      subject: "Your payment to China is complete",
      text: `Hi ${params.userName},\n\nGood news, your vendor has been paid.\n\nAmount debited: ${debitedText}\nCNY sent: ${cnyText}${
        params.recipientName ? `\nRecipient: ${params.recipientName}` : ""
      }\nReference: ${shortRef}\nDate: ${dateText}${proofLine}\n\nView your transactions: ${transactionsUrl}`,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717;max-width:480px;margin:0 auto;">
  <p>Hi ${safeName},</p>
  <p>Good news, your vendor has been paid.${proofLine}</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:6px 0;color:#6b7280;">Amount debited</td><td style="padding:6px 0;text-align:right;font-weight:600;">${debitedText}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280;">CNY sent</td><td style="padding:6px 0;text-align:right;font-weight:600;">${cnyText}</td></tr>
    ${safeRecipient ? `<tr><td style="padding:6px 0;color:#6b7280;">Recipient</td><td style="padding:6px 0;text-align:right;">${safeRecipient}</td></tr>` : ""}
    <tr><td style="padding:6px 0;color:#6b7280;">Date</td><td style="padding:6px 0;text-align:right;">${dateText}</td></tr>
  </table>
  <p style="color:#6b7280;font-size:13px;">Reference: ${shortRef}</p>
  <p style="margin:24px 0;">
    <a href="${transactionsUrl}" style="display:inline-block;background:#1b7a4b;color:#ffffff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:500;">View your transactions</a>
  </p>
</div>`,
    });
    if (error) {
      console.error("[email] rmb completed: Resend returned an error", error);
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error sending email";
    console.error("[email] rmb completed: failed to send via Resend", err);
    return { sent: false, reason };
  }
}

// Fire-and-forget rejection notice for the customer (src/lib/actions/admin.ts's
// rejectRmbTransaction). Same discipline as sendRmbCompletedEmail above.
export async function sendRmbRejectedEmail(params: {
  userName: string;
  userEmail: string;
  reason: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const reason = "RESEND_API_KEY is not configured";
    console.warn(`[email] ${reason} — skipping RMB rejection email`);
    return { sent: false, reason };
  }

  try {
    const resend = new Resend(apiKey);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const transactionsUrl = `${appUrl}/transactions`;
    const safeName = escapeHtml(params.userName);
    const safeReason = escapeHtml(params.reason);

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.userEmail,
      subject: "Your payment to China was not completed",
      text: `Hi ${params.userName},\n\nWe could not complete your payment to China.\n\nReason: ${params.reason}\n\nThe amount you set aside has been returned to your balance. You can review your transactions here: ${transactionsUrl}`,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717;max-width:480px;margin:0 auto;">
  <p>Hi ${safeName},</p>
  <p>We could not complete your payment to China.</p>
  <p><strong>Reason:</strong> ${safeReason}</p>
  <p>The amount you set aside has been returned to your balance.</p>
  <p style="margin:24px 0;">
    <a href="${transactionsUrl}" style="display:inline-block;background:#1b7a4b;color:#ffffff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:500;">Review your transactions</a>
  </p>
</div>`,
    });
    if (error) {
      console.error("[email] rmb rejected: Resend returned an error", error);
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error sending email";
    console.error("[email] rmb rejected: failed to send via Resend", err);
    return { sent: false, reason };
  }
}

// Generic best-effort email for any admin-created notification (approveKyc/rejectKyc's and the
// RMB completion/rejection functions above keep their own dedicated, richer templates — this one
// is for notifyUser, src/lib/actions/admin.ts, and the admin notification compose action, where
// the title/body are arbitrary). Same never-throws discipline as every other function here.
export async function sendNotificationEmail(params: {
  to: string;
  name: string;
  title: string;
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const reason = "RESEND_API_KEY is not configured";
    console.warn(`[email] ${reason} — skipping notification email`);
    return { sent: false, reason };
  }

  try {
    const resend = new Resend(apiKey);
    const safeName = escapeHtml(params.name);
    const safeBody = escapeHtml(params.body);
    const ctaLabel = params.ctaLabel ?? "Open JesDanPay";
    const ctaHtml = params.ctaUrl
      ? `<p style="margin:24px 0;">
    <a href="${params.ctaUrl}" style="display:inline-block;background:#1b7a4b;color:#ffffff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:500;">${escapeHtml(ctaLabel)}</a>
  </p>`
      : "";
    const ctaText = params.ctaUrl ? `\n\n${ctaLabel}: ${params.ctaUrl}` : "";

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.to,
      subject: params.title,
      text: `Hi ${params.name},\n\n${params.body}${ctaText}`,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717;max-width:480px;margin:0 auto;">
  <p>Hi ${safeName},</p>
  <p>${safeBody}</p>
  ${ctaHtml}
</div>`,
    });
    if (error) {
      console.error("[email] notification: Resend returned an error", error);
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error sending email";
    console.error("[email] notification: failed to send via Resend", err);
    return { sent: false, reason };
  }
}

// Fire-and-forget admin alert for a new support-chat message (src/lib/actions/support.ts's
// sendSupportMessage) — this is the "a user messaged support and nobody ever found out" gap the
// client reported. One send, not one per admin: `to` is the sender address itself and every real
// admin goes in `bcc`, so no admin's email is ever exposed to another in a shared To/Cc. Same
// never-throws, skip-quietly-without-RESEND_API_KEY discipline as every email above.
export async function sendSupportMessageAlertEmail(params: {
  to: string[];
  userName: string;
  userEmail: string;
  userId: string;
  messagePreview: string;
  // True when the message is an image attachment with no caption text — the preview itself is
  // never the image or its signed URL (that URL is short-lived and user-scoped, and must never
  // leave the app), just a plain "sent you an image" line pointing back at the chat.
  isImageOnly?: boolean;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const reason = "RESEND_API_KEY is not configured";
    console.warn(`[email] ${reason} — skipping support message alert`);
    return { sent: false, reason };
  }
  if (params.to.length === 0) {
    const reason = "No admin recipients configured";
    console.warn(`[email] ${reason} — skipping support message alert`);
    return { sent: false, reason };
  }

  try {
    const resend = new Resend(apiKey);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const chatUrl = `${appUrl}/admin/chat/${params.userId}`;
    const preview = params.isImageOnly ? "Sent an image" : truncateMessage(params.messagePreview);
    const safeName = escapeHtml(params.userName);
    const safeEmail = escapeHtml(params.userEmail);
    const safePreview = escapeHtml(preview);

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: FROM_ADDRESS,
      bcc: params.to,
      subject: `New support message from ${params.userName}`,
      text: `${params.userName} (${params.userEmail}) sent a new support message:\n\n"${preview}"\n\nReply in admin chat: ${chatUrl}`,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717;max-width:480px;margin:0 auto;">
  <p><strong>${safeName}</strong> (${safeEmail}) sent a new support message:</p>
  <p style="padding:12px 16px;background:#f5f5f5;border-radius:12px;white-space:pre-wrap;">${safePreview}</p>
  <p style="margin:24px 0;">
    <a href="${chatUrl}" style="display:inline-block;background:#1b7a4b;color:#ffffff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:500;">Reply in admin chat</a>
  </p>
</div>`,
    });
    if (error) {
      console.error("[email] support message alert: Resend returned an error", error);
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error sending email";
    console.error("[email] support message alert: failed to send via Resend", err);
    return { sent: false, reason };
  }
}

// Fire-and-forget payout notice for the customer (src/lib/withdrawals/notify.ts, called from
// every place a withdrawal can actually complete — the automated Busha payout, the webhook, the
// reconciliation cron, and an admin's own manual completion). Same never-throws discipline as
// every other email here.
export async function sendWithdrawalCompletedEmail(params: {
  userName: string;
  userEmail: string;
  amount: number;
  currency: string;
  netAmount: number;
  reference: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const reason = "RESEND_API_KEY is not configured";
    console.warn(`[email] ${reason} — skipping withdrawal completed email`);
    return { sent: false, reason };
  }

  try {
    const resend = new Resend(apiKey);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const transactionsUrl = `${appUrl}/transactions`;
    const safeName = escapeHtml(params.userName);
    const amountText = `${params.currency} ${params.netAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const shortRef = params.reference.slice(0, 8);

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.userEmail,
      subject: "Your withdrawal is complete",
      text: `Hi ${params.userName},\n\nYour withdrawal has been paid out. ${amountText} was sent to your saved recipient.\n\nReference: ${shortRef}\n\nView your transactions: ${transactionsUrl}`,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717;max-width:480px;margin:0 auto;">
  <p>Hi ${safeName},</p>
  <p>Your withdrawal has been paid out. <strong>${amountText}</strong> was sent to your saved recipient.</p>
  <p style="color:#6b7280;font-size:13px;">Reference: ${shortRef}</p>
  <p style="margin:24px 0;">
    <a href="${transactionsUrl}" style="display:inline-block;background:#1b7a4b;color:#ffffff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:500;">View your transactions</a>
  </p>
</div>`,
    });
    if (error) {
      console.error("[email] withdrawal completed: Resend returned an error", error);
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error sending email";
    console.error("[email] withdrawal completed: failed to send via Resend", err);
    return { sent: false, reason };
  }
}

// Fire-and-forget failure notice for the customer, same call sites as sendWithdrawalCompletedEmail
// above — a failed withdrawal always refunds the wallet (fail_withdrawal_payout/
// admin_reject_withdrawal), so this tells the user their balance is back rather than leaving them
// wondering where the money went.
export async function sendWithdrawalFailedEmail(params: {
  userName: string;
  userEmail: string;
  amount: number;
  currency: string;
  reference: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const reason = "RESEND_API_KEY is not configured";
    console.warn(`[email] ${reason} — skipping withdrawal failed email`);
    return { sent: false, reason };
  }

  try {
    const resend = new Resend(apiKey);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const transactionsUrl = `${appUrl}/transactions`;
    const safeName = escapeHtml(params.userName);
    const amountText = `${params.currency} ${params.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const shortRef = params.reference.slice(0, 8);

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.userEmail,
      subject: "Your withdrawal could not be completed",
      text: `Hi ${params.userName},\n\nWe could not complete your withdrawal of ${amountText}. The full amount has been returned to your balance.\n\nReference: ${shortRef}\n\nView your transactions: ${transactionsUrl}`,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717;max-width:480px;margin:0 auto;">
  <p>Hi ${safeName},</p>
  <p>We could not complete your withdrawal of <strong>${amountText}</strong>. The full amount has been returned to your balance.</p>
  <p style="color:#6b7280;font-size:13px;">Reference: ${shortRef}</p>
  <p style="margin:24px 0;">
    <a href="${transactionsUrl}" style="display:inline-block;background:#1b7a4b;color:#ffffff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:500;">View your transactions</a>
  </p>
</div>`,
    });
    if (error) {
      console.error("[email] withdrawal failed: Resend returned an error", error);
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error sending email";
    console.error("[email] withdrawal failed: failed to send via Resend", err);
    return { sent: false, reason };
  }
}

// Fire-and-forget receipt for a completed CNY conversion (src/lib/actions/payments.ts's
// submitCnyConversion, which completes synchronously — there's no separate admin-approval step
// for this one). Shows both sides of the trade so the receipt is self-contained even without
// opening the app.
export async function sendCnyConversionReceiptEmail(params: {
  userName: string;
  userEmail: string;
  fromAmount: number;
  fromCurrency: string;
  toAmount: number;
  toCurrency: string;
  rate: number;
  reference: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const reason = "RESEND_API_KEY is not configured";
    console.warn(`[email] ${reason} — skipping CNY conversion receipt email`);
    return { sent: false, reason };
  }

  try {
    const resend = new Resend(apiKey);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const transactionsUrl = `${appUrl}/transactions`;
    const safeName = escapeHtml(params.userName);
    const fromText = `${params.fromCurrency} ${params.fromAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const toText = `${params.toCurrency} ${params.toAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const rateText = `1 ${params.fromCurrency} = ${params.rate.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${params.toCurrency}`;
    const shortRef = params.reference.slice(0, 8);

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.userEmail,
      subject: "Your conversion is complete",
      text: `Hi ${params.userName},\n\nYour conversion is complete.\n\nYou converted: ${fromText}\nYou received: ${toText}\nRate used: ${rateText}\nReference: ${shortRef}\n\nView your transactions: ${transactionsUrl}`,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717;max-width:480px;margin:0 auto;">
  <p>Hi ${safeName},</p>
  <p>Your conversion is complete.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:6px 0;color:#6b7280;">You converted</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fromText}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280;">You received</td><td style="padding:6px 0;text-align:right;font-weight:600;">${toText}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280;">Rate used</td><td style="padding:6px 0;text-align:right;">${rateText}</td></tr>
  </table>
  <p style="color:#6b7280;font-size:13px;">Reference: ${shortRef}</p>
  <p style="margin:24px 0;">
    <a href="${transactionsUrl}" style="display:inline-block;background:#1b7a4b;color:#ffffff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:500;">View your transactions</a>
  </p>
</div>`,
    });
    if (error) {
      console.error("[email] cny conversion receipt: Resend returned an error", error);
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error sending email";
    console.error("[email] cny conversion receipt: failed to send via Resend", err);
    return { sent: false, reason };
  }
}

// Fire-and-forget notice for the customer (src/lib/actions/support.ts's sendAdminSupportReply)
// — the other half of the same gap: a user who messaged support had no way to know an admin had
// actually replied short of reopening the app. Deliberately shows only the new reply, never the
// full thread (that stays in-app). Same discipline as every other email in this file.
export async function sendSupportReplyEmail(params: {
  to: string;
  userName: string;
  messagePreview: string;
  // Same reasoning as sendSupportMessageAlertEmail's isImageOnly — never embeds or links the
  // signed attachment URL itself, just says an image was sent and points back at the app.
  isImageOnly?: boolean;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const reason = "RESEND_API_KEY is not configured";
    console.warn(`[email] ${reason} — skipping support reply email`);
    return { sent: false, reason };
  }

  try {
    const resend = new Resend(apiKey);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const homeUrl = `${appUrl}/home`;
    const preview = params.isImageOnly ? "Sent an image" : truncateMessage(params.messagePreview);
    const safeName = escapeHtml(params.userName);
    const safePreview = escapeHtml(preview);

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.to,
      subject: "You have a new reply from JesDanPay support",
      text: `Hi ${params.userName},\n\nYou have a new reply from JesDanPay support:\n\n"${preview}"\n\nOpen chat: ${homeUrl}`,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717;max-width:480px;margin:0 auto;">
  <p>Hi ${safeName},</p>
  <p>You have a new reply from JesDanPay support:</p>
  <p style="padding:12px 16px;background:#f5f5f5;border-radius:12px;white-space:pre-wrap;">${safePreview}</p>
  <p style="margin:24px 0;">
    <a href="${homeUrl}" style="display:inline-block;background:#1b7a4b;color:#ffffff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:500;">Open chat</a>
  </p>
</div>`,
    });
    if (error) {
      console.error("[email] support reply: Resend returned an error", error);
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error sending email";
    console.error("[email] support reply: failed to send via Resend", err);
    return { sent: false, reason };
  }
}

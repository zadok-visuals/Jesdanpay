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
  deliveredAmount: number;
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
    const amountText = `¥${params.deliveredAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const proofLine = params.hasProof ? " You can view the proof of payment in the app, on this transaction." : "";

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.userEmail,
      subject: "Your payment to China is complete",
      text: `Hi ${params.userName},\n\nGood news - the vendor has been paid. ${amountText} was delivered.${proofLine}\n\nView your transactions: ${transactionsUrl}`,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717;max-width:480px;margin:0 auto;">
  <p>Hi ${safeName},</p>
  <p>Good news, the vendor has been paid. <strong>${amountText}</strong> was delivered.${proofLine}</p>
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

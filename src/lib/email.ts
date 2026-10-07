import { Resend } from "resend";
import { adminEmails } from "@/lib/auth/admin";

const FROM_ADDRESS = "JesDanPay <notifications@jesdanpay.net>";

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
export async function sendKycApprovedEmail(params: { userName: string; userEmail: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[kyc approved email] RESEND_API_KEY is not configured — skipping approval email");
    return;
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
      console.error("[kyc approved email] Resend returned an error", error);
    }
  } catch (err) {
    console.error("[kyc approved email] failed to send via Resend", err);
  }
}

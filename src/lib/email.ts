import { Resend } from "resend";
import { adminEmails } from "@/lib/auth/admin";

const FROM_ADDRESS = "JesDanPay <notifications@jesdanpay.net>";

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

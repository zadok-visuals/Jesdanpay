"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdminUser, requireSuperAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminRole, Currency } from "@/lib/types/database";
import {
  sendKycApprovedEmail,
  sendRmbCompletedEmail,
  sendRmbRejectedEmail,
  sendNotificationEmail,
  type EmailResult,
} from "@/lib/email";

export interface AdminActionState {
  error?: string;
  // A few actions (sendNotification, sendTestEmail) succeed but still have something worth
  // telling the admin — e.g. the notification saved fine but the email didn't go out. Every other
  // action just leaves this unset.
  message?: string;
}

// Inserts the notification row every admin-initiated user notification needs, then optionally
// emails the same user with the same title/body via the generic sendNotificationEmail template.
// `sendEmail: false` is for callers that already send their OWN richer, dedicated email for this
// exact event (approveKyc, completeRmbTransaction, rejectRmbTransaction) — notifyUser still owns
// writing the notification row for those, it just skips sending a second, plainer email on top.
async function notifyUser(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    userId: string;
    title: string;
    body: string;
    attachmentRef?: string | null;
    emailCtaUrl?: string;
    emailCtaLabel?: string;
    sendEmail?: boolean;
  },
): Promise<{ email: EmailResult }> {
  const { userId, title, body, attachmentRef = null, emailCtaUrl, emailCtaLabel, sendEmail = true } = params;

  const { error: notifyError } = await admin
    .from("notifications")
    .insert({ user_id: userId, title, body, attachment_ref: attachmentRef });
  if (notifyError) console.error("[email] notifyUser: notification insert failed", notifyError);

  if (!sendEmail) {
    return { email: { sent: false, reason: "A dedicated email already covers this notification" } };
  }

  const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
  if (!profile?.email) {
    return { email: { sent: false, reason: "No email on file for this user" } };
  }

  const email = await sendNotificationEmail({
    to: profile.email,
    name: profile.full_name ?? profile.email,
    title,
    body,
    ctaUrl: emailCtaUrl,
    ctaLabel: emailCtaLabel,
  });
  return { email };
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
  revalidatePath("/admin/rmb");
  return {};
}

export interface RmbProofUploadUrlState {
  error?: string;
  path?: string;
  token?: string;
}

// Admin-gated — the destination folder is the CUSTOMER's own user id, not the admin's, so there's
// no RLS path for the admin's own browser session to upload directly (see migration 0043's header
// comment). This mints a short-lived signed upload token via the service-role client instead; the
// browser then finishes the upload itself (uploadToSignedUrl, src/lib/storage/clientUpload.ts) so
// the file bytes never pass through this server action's own 1MB body limit.
export async function createRmbProofUploadUrl(
  transactionId: string,
  fileName: string,
): Promise<RmbProofUploadUrlState> {
  await requireAdminUser();
  if (!transactionId) return { error: "Missing transaction." };

  const admin = createAdminClient();
  const { data: tx } = await admin
    .from("transactions")
    .select("user_id")
    .eq("id", transactionId)
    .eq("type", "rmb_manual")
    .maybeSingle();
  if (!tx) return { error: "We could not find that request. Please refresh and try again." };

  const extMatch = /\.([a-zA-Z0-9]{1,5})$/.exec(fileName);
  const ext = extMatch ? extMatch[1].toLowerCase() : "bin";
  const path = `${tx.user_id}/${transactionId}-${randomUUID().replace(/-/g, "").slice(0, 16)}.${ext}`;

  const { data, error } = await admin.storage.from("rmb-payment-proof").createSignedUploadUrl(path);
  if (error) {
    console.error("[createRmbProofUploadUrl]", error);
    return { error: "We could not prepare the upload. Please try again." };
  }

  return { path: data.path, token: data.token };
}

// Records what was actually delivered to the vendor in China so margin becomes computable —
// requested `amount` vs. `actual_target_amount`, at whatever rate the admin actually got — and
// optionally attaches a payment proof screenshot the customer can view (see createRmbProofUploadUrl
// above for how that file gets uploaded).
export async function completeRmbTransaction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");
  const actualTargetAmount = Number(formData.get("actualTargetAmount"));
  const note = String(formData.get("note") ?? "").trim();
  const proofRefRaw = String(formData.get("proofRef") ?? "").trim();

  if (!Number.isFinite(actualTargetAmount) || actualTargetAmount <= 0) {
    return { error: "Enter the actual CNY amount delivered." };
  }

  const admin = createAdminClient();
  const { data: tx } = await admin
    .from("transactions")
    .select("user_id")
    .eq("id", transactionId)
    .eq("type", "rmb_manual")
    .maybeSingle();
  if (!tx) return { error: "We could not find that request. Please refresh and try again." };

  // Untrusted client input — must point into THIS transaction's own user's folder, never another
  // user's (same discipline as verifyOwnedUpload, src/lib/storage/verifyUpload.ts, applied to
  // user-initiated uploads).
  let proofRef: string | null = null;
  if (proofRefRaw) {
    if (!proofRefRaw.startsWith(`${tx.user_id}/`)) {
      return { error: "That payment proof upload doesn't match this request. Please re-upload it." };
    }
    proofRef = proofRefRaw;
  }

  const { error } = await admin.rpc("admin_complete_rmb_transaction", {
    p_transaction_id: transactionId,
    p_actual_target_amount: actualTargetAmount,
    p_note: note,
    p_proof_ref: proofRef,
  });

  if (error) return { error: error.message };

  // Best effort from here on — the completion itself already succeeded via the RPC above, that's
  // the authoritative action, so a failed notification/email shouldn't turn this into an error the
  // admin has to retry. Same pattern approveKyc/rejectKyc already use.
  const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", tx.user_id).maybeSingle();
  const title = "Your payment to China is complete";
  const body = `The vendor has been paid. ¥${actualTargetAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} was delivered.`;

  // sendEmail: false — sendRmbCompletedEmail below is the dedicated template for this event
  // (mentions the proof screenshot specifically), notifyUser here only writes the notification row.
  await notifyUser(admin, { userId: tx.user_id, title, body, attachmentRef: proofRef, sendEmail: false });

  if (profile?.email) {
    await sendRmbCompletedEmail({
      userName: profile.full_name ?? profile.email,
      userEmail: profile.email,
      deliveredAmount: actualTargetAmount,
      hasProof: !!proofRef,
    });
  }

  revalidatePath("/admin/rmb");
  return {};
}

export async function rejectRmbTransaction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) {
    return { error: "A rejection reason is required." };
  }

  const admin = createAdminClient();

  // Needed up front so the notification/email below know who to reach — fetched before the RPC
  // runs, but only ever used after it succeeds (see the `if (error) return` below). The RPC itself
  // already raises on a transaction that's already `failed`, so that guard alone keeps these from
  // firing on a repeat rejection.
  const { data: tx } = await admin
    .from("transactions")
    .select("user_id")
    .eq("id", transactionId)
    .eq("type", "rmb_manual")
    .maybeSingle();
  if (!tx) return { error: "Transaction not found." };

  const { error } = await admin.rpc("admin_reject_rmb_transaction", {
    p_transaction_id: transactionId,
    p_reason: reason,
  });

  if (error) return { error: error.message };

  // Best effort — the rejection itself already succeeded via the RPC above, that's the
  // authoritative action, so a failed notification/email shouldn't turn this into an error the
  // admin has to retry.
  const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", tx.user_id).maybeSingle();

  // sendEmail: false — sendRmbRejectedEmail below is the dedicated template for this event,
  // notifyUser here only writes the notification row.
  await notifyUser(admin, {
    userId: tx.user_id,
    title: "Your payment to China was not completed",
    body: `We could not complete this request: ${reason}. The amount you set aside has been returned to your balance.`,
    sendEmail: false,
  });

  if (profile?.email) {
    await sendRmbRejectedEmail({
      userName: profile.full_name ?? profile.email,
      userEmail: profile.email,
      reason,
    });
  }

  revalidatePath("/admin/rmb");
  return {};
}

export async function approveKyc(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const userId = String(formData.get("userId") ?? "");

  const admin = createAdminClient();

  // Checked BEFORE the RPC runs — admin_approve_kyc itself is idempotent (just re-sets the same
  // status), but the notification/email below must only ever fire on a REAL not-approved ->
  // approved transition, not on a double-click or a second admin tab acting on the same
  // already-approved submission.
  const { data: beforeProfile } = await admin
    .from("profiles")
    .select("kyc_status, email, full_name")
    .eq("id", userId)
    .maybeSingle();
  const wasAlreadyApproved = beforeProfile?.kyc_status === "approved";

  const { error } = await admin.rpc("admin_approve_kyc", { p_user_id: userId });
  if (error) return { error: error.message };

  if (!wasAlreadyApproved) {
    // Best effort — the approval itself already succeeded via the RPC above, that's the
    // authoritative action, so a failed notification/email shouldn't turn this into an error the
    // admin has to retry. Same pattern rejectKyc already uses below.
    // sendEmail: false — sendKycApprovedEmail below is the dedicated template for this event,
    // notifyUser here only writes the notification row.
    await notifyUser(admin, {
      userId,
      title: "Your verification is approved",
      body: "Your identity verification is approved. You now have full access.",
      sendEmail: false,
    });

    if (beforeProfile?.email) {
      await sendKycApprovedEmail({
        userName: beforeProfile.full_name ?? beforeProfile.email,
        userEmail: beforeProfile.email,
      });
    }
  }

  revalidatePath("/admin/kyc");
  return {};
}

export async function rejectKyc(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const userId = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) {
    return { error: "A rejection reason is required." };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_reject_kyc", { p_user_id: userId, p_reason: reason });

  if (error) return { error: error.message };

  // Best effort — the rejection itself already succeeded via the RPC above, that's the
  // authoritative action, so a failed notification/email shouldn't turn this into an error the
  // admin has to retry. The user still sees the reason via KycStatusBanner on /home and the KYC
  // status page regardless of whether either of these lands.
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await notifyUser(admin, {
    userId,
    title: "Your verification needs attention",
    body: `We couldn't verify your details: ${reason}. Use the banner on your home page to fix and resubmit.`,
    emailCtaUrl: `${appUrl}/home`,
    emailCtaLabel: "Go to your dashboard",
  });

  revalidatePath("/admin/kyc");
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
  revalidatePath("/admin/withdrawals");
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
  revalidatePath("/admin/withdrawals");
  return {};
}

// Above-threshold withdrawals (see AUTOMATED_PAYOUT_USDT_THRESHOLD in
// src/lib/actions/withdrawals.ts) can't be marked paid out until this runs — the exact
// verification mechanism (re-uploaded ID, video call, OTP) is still TBD with the client, so this
// only records that the admin confirmed it happened out-of-band, same "gate it, don't fake it"
// approach already used for changing a saved withdrawal recipient.
export async function confirmWithdrawalVerification(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin_user = await requireAdminUser();
  const transactionId = String(formData.get("transactionId") ?? "");

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_confirm_withdrawal_verification", {
    p_transaction_id: transactionId,
    p_admin_id: admin_user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/withdrawals");
  return {};
}

export async function setCnyMarkupRate(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const fiatMarkupPercent = Number(formData.get("fiatMarkupPercent"));
  const usdtMarkupPercent = Number(formData.get("usdtMarkupPercent"));

  if (!Number.isFinite(fiatMarkupPercent) || fiatMarkupPercent < 0 || fiatMarkupPercent >= 100) {
    return { error: "Enter a valid fiat markup percentage (0-99)." };
  }
  if (!Number.isFinite(usdtMarkupPercent) || usdtMarkupPercent < 0 || usdtMarkupPercent >= 100) {
    return { error: "Enter a valid USDT markup percentage (0-99)." };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_cny_markup_rate", {
    p_fiat_markup_rate: fiatMarkupPercent / 100,
    p_usdt_markup_rate: usdtMarkupPercent / 100,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/rates");
  return {};
}

export async function setCnyTierRate(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();
  const tierMin = Number(formData.get("tierMin"));
  const cnyRate = Number(formData.get("cnyRate"));

  if (!Number.isFinite(cnyRate) || cnyRate <= 0) {
    return { error: "Enter a valid rate." };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_cny_tier_rate", {
    p_tier_min: tierMin,
    p_cny_rate: cnyRate,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/rates");
  return {};
}

export async function setSupplierRate(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const adminUser = await requireAdminUser();
  // Submitted as a single "BASE/QUOTE" value from one <select> (src/app/admin/pnl/page.tsx) —
  // simpler than two separate dropdowns for a fixed, short list of configured pairs.
  const [baseCurrency, quoteCurrency] = String(formData.get("pair") ?? "").split("/") as [Currency, Currency];
  const buyRate = Number(formData.get("buyRate"));
  const effectiveFromRaw = String(formData.get("effectiveFrom") ?? "").trim();

  if (!baseCurrency || !quoteCurrency) {
    return { error: "Select a currency pair." };
  }

  if (!Number.isFinite(buyRate) || buyRate <= 0) {
    return { error: "Enter a valid buy rate." };
  }
  const effectiveFrom = effectiveFromRaw ? new Date(effectiveFromRaw) : new Date();
  if (Number.isNaN(effectiveFrom.getTime())) {
    return { error: "Enter a valid effective-from date/time." };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_supplier_rate", {
    p_base_currency: baseCurrency,
    p_quote_currency: quoteCurrency,
    p_buy_rate: buyRate,
    p_effective_from: effectiveFrom.toISOString(),
    p_set_by: adminUser.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/pnl");
  return {};
}

// Keeps one broadcast "Also email every user" send from trying to fire hundreds of emails at
// once from inside a single server action request — Resend's own rate limits aside, that's just
// not a reasonable thing for one request to do. A send larger than this cap still notifies
// everyone in-app (the notification row itself has no cap), it just only emails the first
// BROADCAST_EMAIL_MAX_RECIPIENTS of them; growing past that is a background-job problem, not a
// bigger-number-here problem.
const BROADCAST_EMAIL_BATCH_SIZE = 50;
const BROADCAST_EMAIL_BATCH_DELAY_MS = 1000;
const BROADCAST_EMAIL_MAX_RECIPIENTS = 500;

async function emailAllUsers(
  admin: ReturnType<typeof createAdminClient>,
  title: string,
  body: string,
): Promise<{ sent: number; attempted: number }> {
  const { data: recipients } = await admin
    .from("profiles")
    .select("email, full_name")
    .is("suspended_at", null)
    .not("email", "is", null)
    .limit(BROADCAST_EMAIL_MAX_RECIPIENTS);

  const list = recipients ?? [];
  let sent = 0;

  for (let i = 0; i < list.length; i += BROADCAST_EMAIL_BATCH_SIZE) {
    const batch = list.slice(i, i + BROADCAST_EMAIL_BATCH_SIZE);
    // One send per recipient (never a shared To/Cc) — a batch is just "run these concurrently",
    // not one combined email.
    const results = await Promise.all(
      batch.map((p) => sendNotificationEmail({ to: p.email, name: p.full_name ?? p.email, title, body })),
    );
    for (const result of results) {
      if (result.sent) sent += 1;
      else console.error(`[email] broadcast: failed to send — ${result.reason ?? "unknown reason"}`);
    }
    if (i + BROADCAST_EMAIL_BATCH_SIZE < list.length) {
      await new Promise((resolve) => setTimeout(resolve, BROADCAST_EMAIL_BATCH_DELAY_MS));
    }
  }

  return { sent, attempted: list.length };
}

export async function sendNotification(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdminUser();

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const target = String(formData.get("target") ?? "all");
  const userEmail = String(formData.get("userEmail") ?? "").trim();
  const emailAll = formData.get("emailAll") === "true";

  if (!title || !body) {
    return { error: "Title and body are required." };
  }

  const admin = createAdminClient();

  if (target === "user") {
    if (!userEmail) return { error: "Enter the recipient's email." };
    const { data: profile } = await admin.from("profiles").select("id").ilike("email", userEmail).maybeSingle();
    if (!profile) return { error: "No user found with that email." };

    const { email } = await notifyUser(admin, { userId: profile.id, title, body });
    revalidatePath("/admin/notifications");
    return {
      message: email.sent
        ? "Notification sent. Email delivered."
        : `Notification saved, but the email was not sent: ${email.reason ?? "Unknown error"}`,
    };
  }

  // user_id left null for a broadcast — every signed-in user's own RLS policy (migration 0037)
  // already lets them read a null-user_id row, no separate fan-out insert needed for the in-app
  // side; emailAllUsers below is only for the opt-in email fan-out.
  const { error } = await admin.from("notifications").insert({ user_id: null, title, body });
  if (error) return { error: error.message };

  if (!emailAll) {
    revalidatePath("/admin/notifications");
    return { message: "Notification sent to all users." };
  }

  const { sent, attempted } = await emailAllUsers(admin, title, body);
  revalidatePath("/admin/notifications");
  return {
    message:
      sent === attempted
        ? `Notification sent. Email delivered to ${sent} of ${attempted} users.`
        : `Notification sent. Email delivered to ${sent} of ${attempted} users (${attempted - sent} failed — see server logs).`,
  };
}

// Admin-only sanity check for the Resend setup itself — sends to the signed-in admin's own
// address so the whole notification-email pipeline can be verified without waiting for (or
// faking) a real KYC/RMB event.
export async function sendTestEmail(): Promise<AdminActionState> {
  const adminUser = await requireAdminUser();
  if (!adminUser.email) return { error: "Your admin account has no email address." };

  const result = await sendNotificationEmail({
    to: adminUser.email,
    name: adminUser.email,
    title: "JesDanPay test email",
    body: "This is a test email from the admin notifications page. If you're reading this, Resend is configured correctly.",
  });

  return {
    message: result.sent ? `Test email sent to ${adminUser.email}.` : `Test email was not sent: ${result.reason ?? "Unknown error"}`,
  };
}

// Short-lived, admin-scoped cookie so a sign_in row is only logged once per browser session, not
// on every admin page navigation — src/components/admin/AdminSessionLogger.tsx fires this once on
// mount from the persistent admin layout.
const ADMIN_SESSION_COOKIE = "jdp_admin_session_logged";

export async function logAdminSignInIfNeeded(): Promise<void> {
  const user = await requireAdminUser();
  const cookieStore = await cookies();
  if (cookieStore.get(ADMIN_SESSION_COOKIE)) return;

  const admin = createAdminClient();
  const { data: adminUserRow } = await admin.from("admin_users").select("id").eq("id", user.id).maybeSingle();
  // No admin_users row at all means this admin only exists via the ADMIN_EMAILS fallback (see
  // getAdminRole) — nothing to attribute a log row to, so just skip logging rather than erroring.
  if (adminUserRow) {
    await admin.from("admin_login_log").insert({ admin_user_id: adminUserRow.id, event: "sign_in" });
  }
  cookieStore.set(ADMIN_SESSION_COOKIE, "1", { httpOnly: true, maxAge: 60 * 60 * 12, path: "/admin" });
}

// Same shape as src/lib/actions/auth.ts's logOut(), plus a sign_out log row — used by
// LogoutButton ONLY when rendered from within the admin panel (src/app/admin/layout.tsx passes
// this as its `action` prop instead of the default logOut).
export async function adminLogOut(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const admin = createAdminClient();
    const { data: adminUserRow } = await admin.from("admin_users").select("id").eq("id", user.id).maybeSingle();
    if (adminUserRow) {
      await admin.from("admin_login_log").insert({ admin_user_id: adminUserRow.id, event: "sign_out" });
    }
  }

  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
  await supabase.auth.signOut();
  redirect("/login");
}

export interface AddAdminState {
  error?: string;
}

export async function addAdmin(_prevState: AddAdminState, formData: FormData): Promise<AddAdminState> {
  await requireSuperAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as AdminRole;
  if (!email) return { error: "Enter an email address." };
  if (role !== "super_admin" && role !== "admin") return { error: "Choose a role." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (!profile) return { error: "No user found with that email." };

  const { error } = await admin.from("admin_users").upsert({ id: profile.id, role });
  if (error) return { error: error.message };

  revalidatePath("/admin/administrators");
  return {};
}

export interface RemoveAdminState {
  error?: string;
}

export async function removeAdmin(_prevState: RemoveAdminState, formData: FormData): Promise<RemoveAdminState> {
  await requireSuperAdmin();

  const adminUserId = String(formData.get("adminUserId") ?? "");
  if (!adminUserId) return { error: "Missing admin." };

  const admin = createAdminClient();

  // Never let the last super_admin remove themselves (or be removed) — that would leave nobody
  // able to manage admins going forward, the exact lockout class this whole feature is meant to
  // avoid repeating (see src/lib/auth/admin.ts's MFA enroll/challenge fallback for the same
  // principle applied elsewhere).
  const { data: target } = await admin.from("admin_users").select("role").eq("id", adminUserId).maybeSingle();
  if (target?.role === "super_admin") {
    const { count } = await admin
      .from("admin_users")
      .select("*", { count: "exact", head: true })
      .eq("role", "super_admin");
    if ((count ?? 0) <= 1) {
      return { error: "Can't remove the last super admin." };
    }
  }

  const { error } = await admin.from("admin_users").delete().eq("id", adminUserId);
  if (error) return { error: error.message };

  revalidatePath("/admin/administrators");
  return {};
}

export async function suspendUser(_prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdminUser();

  const userId = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!userId) return { error: "Missing user." };
  if (!reason) return { error: "A suspension reason is required." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ suspended_at: new Date().toISOString(), suspension_reason: reason })
    .eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath(`/admin/users/${userId}`);
  return {};
}

export async function releaseUser(_prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdminUser();

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Missing user." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ suspended_at: null, suspension_reason: null })
    .eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath(`/admin/users/${userId}`);
  return {};
}

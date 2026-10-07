"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendKycSubmissionAlert } from "@/lib/email";
import { verifyOwnedUpload } from "@/lib/storage/verifyUpload";

export interface KycActionState {
  error?: string;
}

export interface OnboardingBasicsState {
  error?: string;
}

const ACCOUNT_TYPES = new Set(["individual", "business"]);

// Quick onboarding — account type + phone only, reached right after signup (src/app/onboarding/
// kyc/page.tsx). Deliberately does NOT touch kyc_status (stays "not_started") or
// kyc_rejection_reason — this is just account setup, not a submission for review. The actual ID
// submission (submitIndividualKyc/submitBusinessKyc below) is what moves kyc_status to "pending",
// reached later from the dashboard's KycStatusBanner whenever the user chooses to.
export async function saveOnboardingBasics(
  _prevState: OnboardingBasicsState,
  formData: FormData,
): Promise<OnboardingBasicsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const accountType = String(formData.get("accountType") ?? "");
  const phone = String(formData.get("phone") ?? "").trim();

  if (!ACCOUNT_TYPES.has(accountType)) {
    return { error: "Choose Individual or Business to continue." };
  }
  if (!phone) {
    return { error: "Phone number is required." };
  }

  // Business has no individual_tier_1/2/3 split (see kyc_tier enum, migration 0001) — every
  // business document, phone_number included, uses the single "business" tier, same as
  // submitBusinessKyc's own documents below.
  const tier = accountType === "business" ? "business" : "individual_tier_1";

  // Upserted (not inserted) so re-visiting this step after already saving doesn't duplicate the
  // row — same (user_id, document_type) unique constraint (migration 0033) every other
  // kyc_documents write in this file relies on. Written here purely so an admin looking at this
  // user's documents can already see their phone number; it's not what gates admin review (that's
  // driven by profiles.kyc_status, untouched here).
  const { error: docError } = await supabase
    .from("kyc_documents")
    .upsert(
      { user_id: user.id, tier, document_type: "phone_number", value: phone, status: "pending" },
      { onConflict: "user_id,document_type" },
    );
  if (docError) return { error: docError.message };

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ phone, kyc_type: accountType as "individual" | "business" })
    .eq("id", user.id);
  if (profileError) return { error: profileError.message };

  redirect("/home");
}

// Files are no longer posted through this action's own FormData — the browser uploads straight
// to the "kyc-documents" bucket first (see clientUpload.ts) and only this resulting path string
// comes through here, avoiding Next's server action body limit entirely for what used to be a
// multi-megabyte phone photo. A path is still untrusted client input though, so it's verified
// (own folder + object actually exists) before being written into kyc_documents for a reviewer
// to later open. Returns null (silently skip) for a blank field, since every upload is optional
// at the form level; throws a friendly, UI-safe message if a non-blank path fails verification.
async function verifiedKycFileRef(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
  field: string,
): Promise<string | null> {
  const path = String(formData.get(field) ?? "").trim();
  if (!path) return null;
  const ok = await verifyOwnedUpload(supabase, "kyc-documents", userId, path);
  if (!ok) throw new Error("We couldn't verify one of your uploaded files. Please try uploading it again.");
  return path;
}

export async function submitIndividualKyc(
  _prevState: KycActionState,
  formData: FormData,
): Promise<KycActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Decided here, from the stored profile — NEVER from a client-sent value, so a crafted
  // request can't claim to be Nigerian (or not) to pick which fields get validated/stored. The
  // phone itself is read from here now too, not from formData — it's already collected by the
  // quick-onboarding step (saveOnboardingBasics above) by the time a user can reach this form at
  // all (see the page-level guard in individual/page.tsx), so there's nothing left to validate
  // here beyond "it's actually there."
  const { data: profile } = await supabase.from("profiles").select("country, phone").eq("id", user.id).maybeSingle();
  const isNigerian = profile?.country === "NG";

  if (!profile?.phone) {
    return { error: "Finish setting up your account first — go back to your dashboard and click Continue." };
  }

  const bvnOrNin = String(formData.get("bvnOrNin") ?? "").trim();
  const govIdNumber = String(formData.get("govIdNumber") ?? "").trim();
  const govIdType = String(formData.get("govIdType") ?? "").trim();

  // Both-or-neither — the UI's own step gating already enforces this, this is just defense in
  // depth against a request that bypasses it and sends only one of the two.
  if (!isNigerian && (govIdNumber || govIdType) && !(govIdNumber && govIdType)) {
    return { error: "Enter both your Gov ID No and the ID type." };
  }

  try {
    // Renamed from "selfie" — this is now a photo of a government-issued ID (passport, driver's
    // licence, national ID, voter's card), not a face-match selfie. Prefix tier2-government-id.
    const governmentIdPath = await verifiedKycFileRef(supabase, user.id, formData, "governmentId");
    const proofOfAddressPath = await verifiedKycFileRef(supabase, user.id, formData, "proofOfAddress");

    // No phone_number entry here — saveOnboardingBasics already wrote that row once, and the
    // "reset every row to pending" sweep below re-activates it on every resubmission too, so
    // there's nothing for this action to (re)write for it.
    const documents: {
      tier: "individual_tier_2" | "individual_tier_3";
      document_type: string;
      value?: string;
      file_ref?: string;
    }[] = [];

    if (isNigerian) {
      if (bvnOrNin) {
        documents.push({ tier: "individual_tier_2", document_type: "bvn_or_nin", value: bvnOrNin });
      }
    } else if (govIdNumber && govIdType) {
      documents.push({ tier: "individual_tier_2", document_type: "gov_id_number", value: govIdNumber });
      documents.push({ tier: "individual_tier_2", document_type: "gov_id_type", value: govIdType });
    }
    if (governmentIdPath) {
      documents.push({ tier: "individual_tier_2", document_type: "government_id", file_ref: governmentIdPath });
    }
    if (proofOfAddressPath) {
      documents.push({
        tier: "individual_tier_3",
        document_type: "proof_of_address",
        file_ref: proofOfAddressPath,
      });
    }

    // Resubmission (e.g. after a rejection) must replace the existing row for a document_type,
    // not insert a duplicate alongside it — upsert against the (user_id, document_type) unique
    // constraint (migration 0033), explicitly resetting status to "pending" on every row touched
    // since a resubmission always means "review this fresh," regardless of its previous status.
    if (documents.length > 0) {
      const { error: docsError } = await supabase
        .from("kyc_documents")
        .upsert(
          documents.map((doc) => ({ ...doc, user_id: user.id, status: "pending" as const })),
          { onConflict: "user_id,document_type" },
        );
      if (docsError) throw docsError;
    }

    // admin_reject_kyc (migration 0033) flips EVERY one of this user's kyc_documents rows to
    // "rejected", not just the ones a reviewer called out — so a resubmission that only touches
    // some document_types (e.g. just a new government ID, no new proof of address) would
    // otherwise leave those untouched rows (including phone_number) stuck at "rejected" right
    // next to the freshly "pending" ones above. The RLS "kyc_documents: update own" policy (also
    // migration 0033) already covers this update under the user's own session.
    const { error: resetError } = await supabase
      .from("kyc_documents")
      .update({ status: "pending" })
      .eq("user_id", user.id);
    if (resetError) throw resetError;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ kyc_type: "individual", kyc_status: "pending", kyc_rejection_reason: null })
      .eq("id", user.id);
    if (profileError) throw profileError;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong. Please try again." };
  }

  // Best-effort — see sendKycSubmissionAlert's own header comment for why this never throws.
  await sendKycSubmissionAlert({
    userName: (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "A user",
    userEmail: user.email ?? "unknown",
  });

  redirect("/onboarding/kyc/status");
}

export async function submitBusinessKyc(
  _prevState: KycActionState,
  formData: FormData,
): Promise<KycActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const businessName = String(formData.get("businessName") ?? "").trim();
  const tin = String(formData.get("tin") ?? "").trim();
  const ownershipStructure = String(formData.get("ownershipStructure") ?? "").trim();

  if (!businessName || !tin) {
    return { error: "Business name and TIN are required." };
  }

  try {
    const cacCertificatePath = await verifiedKycFileRef(supabase, user.id, formData, "cacCertificate");
    const directorIdPath = await verifiedKycFileRef(supabase, user.id, formData, "directorId");
    const proofOfBusinessAddressPath = await verifiedKycFileRef(
      supabase,
      user.id,
      formData,
      "proofOfBusinessAddress",
    );

    const documents: { document_type: string; value?: string; file_ref?: string }[] = [
      { document_type: "tin", value: tin },
    ];
    if (ownershipStructure) {
      documents.push({ document_type: "ownership_structure", value: ownershipStructure });
    }
    if (cacCertificatePath) {
      documents.push({ document_type: "cac_certificate", file_ref: cacCertificatePath });
    }
    if (directorIdPath) {
      documents.push({ document_type: "director_id", file_ref: directorIdPath });
    }
    if (proofOfBusinessAddressPath) {
      documents.push({ document_type: "proof_of_business_address", file_ref: proofOfBusinessAddressPath });
    }

    // Same upsert-on-resubmission fix as submitIndividualKyc above.
    const { error: docsError } = await supabase
      .from("kyc_documents")
      .upsert(
        documents.map((doc) => ({ ...doc, user_id: user.id, tier: "business" as const, status: "pending" as const })),
        { onConflict: "user_id,document_type" },
      );
    if (docsError) throw docsError;

    // Same stale-rejected-row sweep as submitIndividualKyc above — see that comment.
    const { error: resetError } = await supabase
      .from("kyc_documents")
      .update({ status: "pending" })
      .eq("user_id", user.id);
    if (resetError) throw resetError;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ business_name: businessName, kyc_type: "business", kyc_status: "pending", kyc_rejection_reason: null })
      .eq("id", user.id);
    if (profileError) throw profileError;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong. Please try again." };
  }

  // Best-effort — see sendKycSubmissionAlert's own header comment for why this never throws.
  await sendKycSubmissionAlert({
    userName: businessName || (user.user_metadata?.full_name as string | undefined) || user.email || "A user",
    userEmail: user.email ?? "unknown",
  });

  redirect("/onboarding/kyc/status");
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendKycSubmissionAlert } from "@/lib/email";
import { verifyOwnedUpload } from "@/lib/storage/verifyUpload";

export interface KycActionState {
  error?: string;
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

  const phone = String(formData.get("phone") ?? "").trim();
  const bvnOrNin = String(formData.get("bvnOrNin") ?? "").trim();

  if (!phone) {
    return { error: "Phone number is required." };
  }

  try {
    const selfiePath = await verifiedKycFileRef(supabase, user.id, formData, "selfie");
    const proofOfAddressPath = await verifiedKycFileRef(supabase, user.id, formData, "proofOfAddress");

    const documents: {
      tier: "individual_tier_1" | "individual_tier_2" | "individual_tier_3";
      document_type: string;
      value?: string;
      file_ref?: string;
    }[] = [{ tier: "individual_tier_1", document_type: "phone_number", value: phone }];

    if (bvnOrNin) {
      documents.push({ tier: "individual_tier_2", document_type: "bvn_or_nin", value: bvnOrNin });
    }
    if (selfiePath) {
      documents.push({ tier: "individual_tier_2", document_type: "selfie", file_ref: selfiePath });
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
    const { error: docsError } = await supabase
      .from("kyc_documents")
      .upsert(
        documents.map((doc) => ({ ...doc, user_id: user.id, status: "pending" as const })),
        { onConflict: "user_id,document_type" },
      );
    if (docsError) throw docsError;

    // admin_reject_kyc (migration 0033) flips EVERY one of this user's kyc_documents rows to
    // "rejected", not just the ones a reviewer called out — so a resubmission that only touches
    // some document_types (e.g. just the phone number, no new selfie/proof of address) would
    // otherwise leave those untouched rows stuck at "rejected" right next to the freshly
    // "pending" ones above. The RLS "kyc_documents: update own" policy (also migration 0033)
    // already covers this update under the user's own session.
    const { error: resetError } = await supabase
      .from("kyc_documents")
      .update({ status: "pending" })
      .eq("user_id", user.id);
    if (resetError) throw resetError;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ phone, kyc_type: "individual", kyc_status: "pending", kyc_rejection_reason: null })
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

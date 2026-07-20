"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface KycActionState {
  error?: string;
}

async function uploadKycFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  file: File,
  prefix: string,
) {
  const path = `${userId}/${prefix}-${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("kyc-documents").upload(path, file);
  if (error) throw error;
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
  const selfie = formData.get("selfie") as File | null;
  const proofOfAddress = formData.get("proofOfAddress") as File | null;

  if (!phone) {
    return { error: "Phone number is required." };
  }

  try {
    const documents: {
      tier: "individual_tier_1" | "individual_tier_2" | "individual_tier_3";
      document_type: string;
      value?: string;
      file_ref?: string;
    }[] = [{ tier: "individual_tier_1", document_type: "phone_number", value: phone }];

    if (bvnOrNin) {
      documents.push({ tier: "individual_tier_2", document_type: "bvn_or_nin", value: bvnOrNin });
    }
    if (selfie && selfie.size > 0) {
      const path = await uploadKycFile(supabase, user.id, selfie, "tier2-selfie");
      documents.push({ tier: "individual_tier_2", document_type: "selfie", file_ref: path });
    }
    if (proofOfAddress && proofOfAddress.size > 0) {
      const path = await uploadKycFile(supabase, user.id, proofOfAddress, "tier3-address");
      documents.push({
        tier: "individual_tier_3",
        document_type: "proof_of_address",
        file_ref: path,
      });
    }

    const { error: docsError } = await supabase
      .from("kyc_documents")
      .insert(documents.map((doc) => ({ ...doc, user_id: user.id })));
    if (docsError) throw docsError;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ phone, kyc_type: "individual", kyc_status: "pending" })
      .eq("id", user.id);
    if (profileError) throw profileError;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong. Please try again." };
  }

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
  const cacCertificate = formData.get("cacCertificate") as File | null;
  const directorId = formData.get("directorId") as File | null;
  const proofOfBusinessAddress = formData.get("proofOfBusinessAddress") as File | null;

  if (!businessName || !tin) {
    return { error: "Business name and TIN are required." };
  }

  try {
    const documents: { document_type: string; value?: string; file_ref?: string }[] = [
      { document_type: "tin", value: tin },
    ];
    if (ownershipStructure) {
      documents.push({ document_type: "ownership_structure", value: ownershipStructure });
    }
    if (cacCertificate && cacCertificate.size > 0) {
      const path = await uploadKycFile(supabase, user.id, cacCertificate, "cac-certificate");
      documents.push({ document_type: "cac_certificate", file_ref: path });
    }
    if (directorId && directorId.size > 0) {
      const path = await uploadKycFile(supabase, user.id, directorId, "director-id");
      documents.push({ document_type: "director_id", file_ref: path });
    }
    if (proofOfBusinessAddress && proofOfBusinessAddress.size > 0) {
      const path = await uploadKycFile(
        supabase,
        user.id,
        proofOfBusinessAddress,
        "proof-of-business-address",
      );
      documents.push({ document_type: "proof_of_business_address", file_ref: path });
    }

    const { error: docsError } = await supabase
      .from("kyc_documents")
      .insert(documents.map((doc) => ({ ...doc, user_id: user.id, tier: "business" as const })));
    if (docsError) throw docsError;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ business_name: businessName, kyc_type: "business", kyc_status: "pending" })
      .eq("id", user.id);
    if (profileError) throw profileError;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong. Please try again." };
  }

  redirect("/onboarding/kyc/status");
}

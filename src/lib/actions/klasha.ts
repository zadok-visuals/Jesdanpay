"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import * as klasha from "@/lib/klasha/client";
import { toCustomerError } from "@/lib/provider-error";

export interface KlashaDepositState {
  error?: string;
  redirectUrl?: string;
}

// Deposit collection for GHS only — NGN moved to Busha (confirmed live and working there;
// Klasha's own NGN/GHS deposit access has been blocked account-wide since this was built).
// GHS stays here since Busha's real account rejects it outright ("Invalid Currency GHS").
// GHS always returns a redirect URL to Klasha's hosted payment page (confirmed from docs —
// only NGN used the direct bank-details response, which no longer applies here).
export async function initiateKlashaDeposit(
  _prevState: KlashaDepositState,
  formData: FormData,
): Promise<KlashaDepositState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const currency = String(formData.get("currency") ?? "").toUpperCase();
  const amount = String(formData.get("amount") ?? "");

  if (currency !== "GHS") {
    return { error: "This deposit method only supports GHS." };
  }
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return { error: "Enter a valid amount." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, email")
    .eq("id", user.id)
    .single();
  if (!profile?.phone) {
    return { error: "Add a phone number to your profile (complete KYC) before depositing." };
  }

  const txRef = randomUUID();
  // Server-only — never read in client code, so no NEXT_PUBLIC_ prefix is needed (and using
  // one would unnecessarily ship this into the browser bundle).
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  let result;
  try {
    result = await klasha.createCollection({
      txRef,
      currency: "GHS",
      amount,
      email: profile.email,
      phoneNumber: profile.phone,
      fullName: profile.full_name ?? profile.email,
      redirectUrl: `${appUrl}/accounts`,
    });
  } catch (err) {
    return { error: toCustomerError(err, "klasha.initiateKlashaDeposit") };
  }

  const admin = createAdminClient();
  const { error: insertError } = await admin.from("deposits").insert({
    user_id: user.id,
    currency: "GHS",
    amount: Number(amount),
    provider: "klasha",
    provider_reference: result.tx_ref,
  });
  if (insertError) return { error: insertError.message };

  return { redirectUrl: result.meta.authorization.redirect };
}

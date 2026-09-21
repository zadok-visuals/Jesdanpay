"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import * as klasha from "@/lib/klasha/client";

export interface KlashaDepositState {
  error?: string;
  bankDetails?: { accountNumber: string; bankName: string; expiresAt: string };
  redirectUrl?: string;
}

// Deposit collection for NGN and GHS only — confirmed absence, not unconfirmed: Klasha's
// Payments API documents `currency: NGN|ZAR|GHS` with no KES and no crypto anywhere, so KES
// and USDT stay on Busha (which already works for both). NGN returns bank account details
// directly; GHS returns a redirect URL to Klasha's hosted payment page instead (same as ZAR)
// — the two need different UI treatment, handled by returning one or the other here.
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

  if (currency !== "NGN" && currency !== "GHS") {
    return { error: "Klasha deposits are only available in NGN or GHS." };
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
    return { error: "Add a phone number to your profile (complete KYC) before depositing via Klasha." };
  }

  const txRef = randomUUID();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let result;
  try {
    result = await klasha.createCollection({
      txRef,
      currency,
      amount,
      email: profile.email,
      phoneNumber: profile.phone,
      fullName: profile.full_name ?? profile.email,
      redirectUrl: `${appUrl}/accounts`,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the deposit." };
  }

  const admin = createAdminClient();
  const { error: insertError } = await admin.from("deposits").insert({
    user_id: user.id,
    currency,
    amount: Number(amount),
    provider: "klasha",
    provider_reference: result.tx_ref,
  });
  if (insertError) return { error: insertError.message };

  const auth = result.meta.authorization;
  if (auth.mode === "redirect" && auth.redirect) {
    return { redirectUrl: auth.redirect };
  }
  return {
    bankDetails: {
      accountNumber: auth.transfer_account ?? "",
      bankName: auth.transfer_bank ?? "",
      expiresAt: auth.account_expiration ?? "",
    },
  };
}

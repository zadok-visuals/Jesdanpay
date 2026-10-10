"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import * as klasha from "@/lib/klasha/client";
import { toCustomerError } from "@/lib/provider-error";
import { isCurrencyAvailable } from "@/lib/currency";

export interface KlashaDepositState {
  error?: string;
  redirectUrl?: string;
  bankDetails?: {
    bankName: string;
    accountNumber: string;
    amount?: number;
    expiresAt?: string;
  };
}

// Deposit collection for GHS only — NGN moved to Busha (confirmed live and working there;
// Klasha's own NGN/GHS deposit access has been blocked account-wide since this was built).
// GHS stays here since Busha's real account rejects it outright ("Invalid Currency GHS").
// Docs say GHS always returns a redirect URL to Klasha's hosted payment page (only NGN used the
// direct bank-details response) — but trusting that blindly is exactly what caused the deposit
// button to silently do nothing (redirect came back undefined, nothing checked it), so both
// authorization.mode values are now handled defensively regardless of what's documented.
export async function initiateKlashaDeposit(
  _prevState: KlashaDepositState,
  formData: FormData,
): Promise<KlashaDepositState> {
  // GHS is the only currency this action ever handles — checked first, before any auth lookup,
  // DB write, or call to Klasha, so re-enabling it later really is just removing "GHS" from
  // COMING_SOON_CURRENCIES (src/lib/currency.ts) rather than also hunting for a stray guard here.
  if (!isCurrencyAvailable("GHS")) {
    return { error: "Ghana (GHS) is coming soon." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const userId = user.id;

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
    return { error: "Finish setting up your account (add a phone number) before depositing." };
  }

  const txRef = randomUUID();
  // Server-only — never read in client code, so no NEXT_PUBLIC_ prefix is needed (and using
  // one would unnecessarily ship this into the browser bundle).
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  let result: klasha.KlashaCollectionResult;
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

  // Previously this just returned { redirectUrl: result.meta.authorization.redirect } even when
  // that was undefined — DepositForm.tsx's KlashaDepositForm only renders its redirect branch
  // when redirectUrl is truthy, so the deposit button appeared to do nothing: no UI, no error,
  // nothing logged. The checks below make every outcome either show something or return an
  // error, and never insert a deposits row for an outcome the user can't actually act on.
  const authorization = result.meta?.authorization;
  const mode = authorization?.mode;
  const genericError = "We couldn't open the payment page. Please try again, or contact support if it continues.";

  // Only ever inserted once we actually have something the user can act on — never for an
  // outcome that would otherwise leave them staring at a form that looks like it did nothing.
  async function insertDepositRow(): Promise<{ error: string } | null> {
    const admin = createAdminClient();
    const { error } = await admin.from("deposits").insert({
      user_id: userId,
      currency: "GHS",
      amount: Number(amount),
      provider: "klasha",
      provider_reference: result.tx_ref,
    });
    return error ? { error: error.message } : null;
  }

  if (mode === "redirect") {
    const redirectUrl = authorization?.redirect;
    if (!redirectUrl) {
      console.error("[klasha.initiateKlashaDeposit] missing redirect", {
        mode,
        keys: Object.keys(authorization ?? {}),
      });
      return { error: genericError };
    }

    const insertError = await insertDepositRow();
    if (insertError) return insertError;

    return { redirectUrl };
  }

  if (mode === "banktransfer") {
    const { transfer_account: accountNumber, transfer_bank: bankName, transfer_amount: bankAmount, account_expiration: expiresAt } =
      authorization ?? {};
    if (!accountNumber || !bankName) {
      console.error("[klasha.initiateKlashaDeposit] missing bank details", {
        mode,
        keys: Object.keys(authorization ?? {}),
      });
      return { error: genericError };
    }

    const insertError = await insertDepositRow();
    if (insertError) return insertError;

    return { bankDetails: { bankName, accountNumber, amount: bankAmount, expiresAt } };
  }

  // Neither mode recognized at all — same "never silently do nothing" principle as above.
  console.error("[klasha.initiateKlashaDeposit] unrecognized authorization mode", {
    mode,
    keys: Object.keys(authorization ?? {}),
  });
  return { error: genericError };
}

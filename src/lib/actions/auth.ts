"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AuthActionState {
  error?: string;
}

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "");
  const country = String(formData.get("country") ?? "");

  if (!email || !password || !fullName || !country) {
    return { error: "All fields are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, country } },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.session) {
    redirect("/onboarding/kyc");
  }

  redirect("/auth/check-email");
}

export async function logIn(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/home");
}

export async function logOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export interface ForgotPasswordState {
  error?: string;
  sent?: boolean;
}

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "");
  if (!email) {
    return { error: "Enter your email address." };
  }

  const supabase = await createClient();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
  });

  // Always report success regardless of whether the email exists — don't reveal which emails
  // have accounts.
  if (error) return { error: error.message };
  return { sent: true };
}

export async function resetPassword(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };
  redirect("/login?reset=success");
}

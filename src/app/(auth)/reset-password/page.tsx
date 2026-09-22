"use client";

import { useActionState } from "react";
import { resetPassword, type AuthActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { AuthShell } from "@/components/layout/AuthShell";

const initialState: AuthActionState = {};

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

  return (
    <AuthShell
      imageSrc="/auth-hero-female-v2.png"
      imageAlt="Smiling JesDanPay user holding up the app on their phone"
      imageWidth={1191}
      imageHeight={1500}
    >
      <Card className="p-6 sm:p-8">
        <h1 className="mb-1 text-xl font-semibold">Set a new password</h1>
        <p className="mb-6 text-sm text-foreground/60">
          Choose a new password for your JesDanPay account.
        </p>

        <form action={formAction} className="flex flex-col gap-4">
          <PasswordInput
            label="New password"
            id="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            showStrength
            placeholder="At least 8 characters"
          />
          <PasswordInput
            label="Confirm new password"
            id="confirmPassword"
            name="confirmPassword"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Re-enter your new password"
          />

          {state.error && <p className="text-sm text-danger-500">{state.error}</p>}

          <Button type="submit" loading={pending} className="mt-2 w-full">
            {pending ? "Updating…" : "Update password"}
          </Button>
        </form>
      </Card>
    </AuthShell>
  );
}

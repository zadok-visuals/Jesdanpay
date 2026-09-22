"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type ForgotPasswordState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { AuthShell } from "@/components/layout/AuthShell";

const initialState: ForgotPasswordState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <AuthShell
      imageSrc="/auth-hero-male-v2.png"
      imageAlt="Smiling JesDanPay user holding up the app on their phone"
      imageWidth={1191}
      imageHeight={1500}
    >
      <Card className="p-6 sm:p-8">
        {state.sent ? (
          <>
            <h1 className="mb-2 text-xl font-semibold">Check your email</h1>
            <p className="mb-6 text-sm text-foreground/60">
              If an account exists for that email, we&rsquo;ve sent a link to reset your password.
            </p>
            <Link href="/login">
              <Button variant="secondary" className="w-full">
                Back to login
              </Button>
            </Link>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-xl font-semibold">Forgot your password?</h1>
            <p className="mb-6 text-sm text-foreground/60">
              Enter your email and we&rsquo;ll send you a link to reset it.
            </p>

            <form action={formAction} className="flex flex-col gap-4">
              <Input
                label="Email"
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
              />

              {state.error && <p className="text-sm text-danger-500">{state.error}</p>}

              <Button type="submit" loading={pending} className="mt-2 w-full">
                {pending ? "Sending…" : "Send reset link"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-foreground/60">
              Remembered it?{" "}
              <Link href="/login" className="font-medium text-primary-600 hover:underline">
                Log in
              </Link>
            </p>
          </>
        )}
      </Card>
    </AuthShell>
  );
}

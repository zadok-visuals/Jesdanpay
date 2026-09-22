"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState, useState } from "react";
import { logIn, type AuthActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { AuthShell } from "@/components/layout/AuthShell";

const initialState: AuthActionState = {};

function ResetSuccessBanner() {
  const searchParams = useSearchParams();
  if (searchParams.get("reset") !== "success") return null;

  return (
    <p className="mb-4 rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-700">
      Your password has been reset. Log in with your new password.
    </p>
  );
}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(logIn, initialState);
  const [email, setEmail] = useState("");

  return (
    <AuthShell
      imageSrc="/auth-hero-female-v2.png"
      imageAlt="Smiling JesDanPay user holding up the app on their phone"
      imageWidth={1191}
      imageHeight={1500}
    >
      <Card className="p-6 sm:p-8">
        <h1 className="mb-1 text-xl font-semibold">Welcome back</h1>
        <p className="mb-6 text-sm text-foreground/60">Log in to your JesDanPay account.</p>

        <Suspense fallback={null}>
          <ResetSuccessBanner />
        </Suspense>

        <form action={formAction} className="flex flex-col gap-4">
          <Input
            label="Email"
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <PasswordInput
              label="Password"
              id="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="Enter your password"
            />
            <Link
              href="/forgot-password"
              className="self-end text-sm font-medium text-primary-600 hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          {state.error && <p className="text-sm text-danger-500">{state.error}</p>}

          <Button type="submit" loading={pending} className="mt-2 w-full">
            {pending ? "Logging in…" : "Log in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-foreground/60">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-primary-600 hover:underline">
            Sign up
          </Link>
        </p>
      </Card>
    </AuthShell>
  );
}

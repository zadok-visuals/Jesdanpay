"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { AuthShell } from "@/components/layout/AuthShell";
import { COUNTRIES } from "@/lib/countries";

const initialState: AuthActionState = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  return (
    <AuthShell
      imageSrc="/auth-hero-male-v2.png"
      imageAlt="Smiling JesDanPay user holding up the app on their phone"
      imageWidth={1191}
      imageHeight={1500}
    >
      <Card className="p-6 sm:p-8">
        <h1 className="mb-1 text-xl font-semibold">Create your account</h1>
        <p className="mb-6 text-sm text-foreground/60">
          Facilitating suppliers payment to China.
        </p>

        <form action={formAction} className="flex flex-col gap-4">
          <Input
            label="Full name"
            id="fullName"
            name="fullName"
            type="text"
            required
            autoComplete="name"
            placeholder="e.g. Ada Lovelace"
          />
          <Input
            label="Email"
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
          <PasswordInput
            label="Password"
            id="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            showStrength
            placeholder="At least 8 characters"
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="country" className="text-sm font-medium text-foreground/80">
              Country
            </label>
            <select
              id="country"
              name="country"
              required
              defaultValue=""
              className="h-11 rounded-lg border border-foreground/15 bg-background px-3 text-sm outline-none focus:border-primary-500"
            >
              <option value="" disabled>
                Select your country
              </option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-foreground/40">
              NGN, GHS, or KES wallets are only available for Nigeria, Ghana, or Kenya — every
              account still gets USDT and CNY.
            </p>
          </div>

          {state.error && <p className="text-sm text-danger-500">{state.error}</p>}

          <Button type="submit" loading={pending} className="mt-2 w-full">
            {pending ? "Creating account…" : "Sign up"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-foreground/60">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary-600 hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </AuthShell>
  );
}

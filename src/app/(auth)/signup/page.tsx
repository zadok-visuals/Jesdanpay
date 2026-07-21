"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";

const initialState: AuthActionState = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="mb-1 text-xl font-semibold">Create your account</h1>
      <p className="mb-6 text-sm text-foreground/60">
        Start moving money between Nigeria and China.
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
  );
}

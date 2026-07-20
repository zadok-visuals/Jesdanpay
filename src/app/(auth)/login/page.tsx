"use client";

import Link from "next/link";
import { useActionState } from "react";
import { logIn, type AuthActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";

const initialState: AuthActionState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(logIn, initialState);

  return (
    <Card className="p-8">
      <h1 className="mb-1 text-xl font-semibold">Welcome back</h1>
      <p className="mb-6 text-sm text-foreground/60">Log in to your JesDanPay account.</p>

      <form action={formAction} className="flex flex-col gap-4">
        <Input label="Email" id="email" name="email" type="email" required autoComplete="email" />
        <PasswordInput
          label="Password"
          id="password"
          name="password"
          required
          autoComplete="current-password"
        />

        {state.error && <p className="text-sm text-danger-500">{state.error}</p>}

        <Button type="submit" disabled={pending} className="mt-2 w-full">
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
  );
}

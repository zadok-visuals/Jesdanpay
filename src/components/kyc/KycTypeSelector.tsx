"use client";

import { useActionState, useState } from "react";
import { saveOnboardingBasics, type OnboardingBasicsState } from "@/lib/actions/kyc";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initialState: OnboardingBasicsState = {};

const ACCOUNT_TYPES = [
  { value: "individual", title: "Individual", description: "Verify as a person." },
  { value: "business", title: "Business", description: "Verify as a registered business." },
] as const;

// Just the three countries with a local wallet (see LOCAL_WALLET_COUNTRIES in
// src/lib/countries.ts) — everyone else gets a neutral example rather than guessing a dial code
// for a country JesDanPay doesn't have local rails for yet.
const PHONE_PLACEHOLDERS: Record<string, string> = {
  NG: "+234…",
  GH: "+233…",
  KE: "+254…",
};

export function KycTypeSelector({ country }: { country: string | null }) {
  const [state, formAction, pending] = useActionState(saveOnboardingBasics, initialState);
  const [accountType, setAccountType] = useState<"individual" | "business" | null>(null);
  const [phone, setPhone] = useState("");

  const phonePlaceholder = (country && PHONE_PLACEHOLDERS[country]) || "+1…";
  const canSubmit = accountType !== null && phone.trim().length > 0;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {ACCOUNT_TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setAccountType(option.value)}
            className={`h-full rounded-2xl border p-6 text-left transition-colors ${
              accountType === option.value
                ? "border-primary-400 bg-primary-50"
                : "border-border bg-surface hover:border-primary-300"
            }`}
          >
            <h3 className="mb-1.5 text-base font-semibold">{option.title}</h3>
            <p className="text-sm text-foreground/60">{option.description}</p>
          </button>
        ))}
      </div>

      <Input
        label="Phone number"
        id="phone"
        name="phone"
        type="tel"
        placeholder={phonePlaceholder}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input type="hidden" name="accountType" value={accountType ?? ""} />

      {state.error && <p className="text-sm text-danger-500">{state.error}</p>}

      <Button type="submit" loading={pending} disabled={!canSubmit} className="self-start">
        Save and go to dashboard
      </Button>
    </form>
  );
}

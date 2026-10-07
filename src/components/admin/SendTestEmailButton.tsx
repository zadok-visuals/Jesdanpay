"use client";

import { useState, useTransition } from "react";
import { sendTestEmail } from "@/lib/actions/admin";
import { Button } from "@/components/ui/Button";

// Lets an admin verify the Resend setup (API key present, sender domain verified, etc.) without
// waiting for — or faking — a real KYC/RMB event. Shows the exact result text sendTestEmail
// returns, success or failure, rather than a generic toast, since the whole point is diagnosing
// *why* an email did or didn't go out.
export function SendTestEmailButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const state = await sendTestEmail();
      if (state.error) setResult({ ok: false, text: state.error });
      else setResult({ ok: true, text: state.message ?? "Sent." });
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="secondary" size="sm" loading={isPending} onClick={handleClick}>
        Send test email
      </Button>
      {result && <p className={`text-xs ${result.ok ? "text-success-500" : "text-danger-500"}`}>{result.text}</p>}
    </div>
  );
}

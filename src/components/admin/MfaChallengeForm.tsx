"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

// Step-up flow for an admin who already has a verified TOTP factor but whose current session is
// only at aal1 (e.g. just logged in with password only this session) — challenge()+verify()
// against the EXISTING factor, no enrollment involved. A successful verify promotes the session
// to aal2 itself, so a hard navigation re-evaluates requireAdminUser() with that fresh state.
export function MfaChallengeForm({ factorId }: { factorId: string }) {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      setError(challengeError.message);
      setPending(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (verifyError) {
      setError(verifyError.message);
      setPending(false);
      return;
    }

    window.location.href = "/admin";
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="6-digit code"
        id="mfa-challenge-code"
        inputMode="numeric"
        maxLength={6}
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="123456"
      />
      {error && <p className="text-sm text-danger-500">{error}</p>}
      <Button type="button" onClick={handleVerify} loading={pending} disabled={code.trim().length !== 6}>
        Verify
      </Button>
    </div>
  );
}

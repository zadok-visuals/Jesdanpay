"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type EnrollState =
  | { step: "loading" }
  | { step: "error"; message: string }
  | { step: "scan"; factorId: string; qrCode: string; secret: string };

// Standard Supabase MFA enrollment flow: enroll() creates an unverified TOTP factor and returns a
// QR code + plain-text secret, then challenge()+verify() (not just verify() alone — verify always
// needs a challengeId) confirms the admin actually added it to an authenticator app. A successful
// verify promotes the session to aal2 itself, so a hard navigation to /admin re-evaluates
// requireAdminUser() with that fresh session state rather than relying on client-side router
// state to reflect it.
export function MfaEnrollForm() {
  const [state, setState] = useState<EnrollState>({ step: "loading" });
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.mfa.enroll({ factorType: "totp", issuer: "JesDanPay" }).then(({ data, error }) => {
      if (error) {
        setState({ step: "error", message: error.message });
        return;
      }
      setState({ step: "scan", factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    });
  }, []);

  async function handleVerify() {
    if (state.step !== "scan") return;
    setVerifying(true);
    setError(null);

    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: state.factorId });
    if (challengeError) {
      setError(challengeError.message);
      setVerifying(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: state.factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (verifyError) {
      setError(verifyError.message);
      setVerifying(false);
      return;
    }

    window.location.href = "/admin";
  }

  if (state.step === "loading") {
    return <p className="text-sm text-foreground/50">Setting up...</p>;
  }

  if (state.step === "error") {
    return <p className="text-sm text-danger-500">{state.message}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-foreground/60">
        Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password, etc.),
        then enter the 6-digit code it shows to finish enabling MFA on this admin account.
      </p>
      <img
        src={`data:image/svg+xml;utf-8,${encodeURIComponent(state.qrCode)}`}
        alt="MFA enrollment QR code"
        className="h-48 w-48 self-center rounded-xl border border-border p-2"
      />
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-foreground/60">Can&rsquo;t scan? Enter this code manually:</p>
        <code className="rounded-lg bg-black/[.04] px-3 py-2 text-xs break-all">{state.secret}</code>
      </div>
      <Input
        label="6-digit code"
        id="mfa-code"
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="123456"
      />
      {error && <p className="text-sm text-danger-500">{error}</p>}
      <Button type="button" onClick={handleVerify} loading={verifying} disabled={code.trim().length !== 6}>
        Enable MFA
      </Button>
    </div>
  );
}

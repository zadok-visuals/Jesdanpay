"use client";

import { useActionState, useState } from "react";
import { submitIndividualKyc, type KycActionState } from "@/lib/actions/kyc";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { StepIndicator } from "@/components/ui/StepIndicator";

const initialState: KycActionState = {};
const TOTAL_STEPS = 3;

export default function IndividualKycPage() {
  const [state, formAction, pending] = useActionState(submitIndividualKyc, initialState);
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [bvnOrNin, setBvnOrNin] = useState("");
  const [selfie, setSelfie] = useState<File | null>(null);
  const [proofOfAddress, setProofOfAddress] = useState<File | null>(null);

  const canContinueStep1 = phone.trim().length > 0;
  const canContinueStep2 = bvnOrNin.trim().length > 0 && selfie !== null;

  return (
    <Card className="p-8">
      <StepIndicator step={step} total={TOTAL_STEPS} />

      <form action={formAction} className="flex flex-col gap-4">
        <div className={step === 1 ? "flex flex-col gap-4" : "hidden"}>
          <h1 className="mb-1 text-lg font-semibold">Tier 1 — Phone verification</h1>
          <p className="mb-2 text-sm text-foreground/60">
            Unlocks a low transaction limit to get you started.
          </p>
          <Input
            label="Phone number"
            id="phone"
            name="phone"
            type="tel"
            placeholder="+234…"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className={step === 2 ? "flex flex-col gap-4" : "hidden"}>
          <h1 className="mb-1 text-lg font-semibold">Tier 2 — Identity verification</h1>
          <p className="mb-2 text-sm text-foreground/60">
            Raises your limit. Provide your BVN or NIN and a selfie for a match.
          </p>
          <Input
            label="BVN or NIN"
            id="bvnOrNin"
            name="bvnOrNin"
            type="text"
            value={bvnOrNin}
            onChange={(e) => setBvnOrNin(e.target.value)}
          />
          <FileDropzone label="Selfie photo" accept="image/*" onFileSelected={setSelfie} />
        </div>

        <div className={step === 3 ? "flex flex-col gap-4" : "hidden"}>
          <h1 className="mb-1 text-lg font-semibold">Tier 3 — Proof of address</h1>
          <p className="mb-2 text-sm text-foreground/60">
            Unlocks your highest transaction limit. A recent utility bill or bank statement works.
          </p>
          <FileDropzone
            label="Proof of address"
            accept="image/*,.pdf"
            onFileSelected={setProofOfAddress}
          />
        </div>

        {/* Real file inputs live outside the hidden steps so selections survive step changes. */}
        <FileInputBridge name="selfie" file={selfie} />
        <FileInputBridge name="proofOfAddress" file={proofOfAddress} />

        {state.error && <p className="text-sm text-danger-500">{state.error}</p>}

        <div className="mt-2 flex justify-between gap-3">
          {step > 1 ? (
            <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : (
            <span />
          )}

          {step < TOTAL_STEPS ? (
            <Button
              type="button"
              disabled={step === 1 ? !canContinueStep1 : !canContinueStep2}
              onClick={() => setStep(step + 1)}
            >
              Continue
            </Button>
          ) : (
            <Button type="submit" loading={pending}>
              {pending ? "Submitting…" : "Submit for review"}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

// Keeps a real <input type="file"> in the DOM (required for FormData) synced to
// the File selected via FileDropzone, using a DataTransfer to build a FileList.
function FileInputBridge({ name, file }: { name: string; file: File | null }) {
  return (
    <input
      type="file"
      name={name}
      className="hidden"
      ref={(input) => {
        if (!input) return;
        const transfer = new DataTransfer();
        if (file) transfer.items.add(file);
        input.files = transfer.files;
      }}
      readOnly
    />
  );
}

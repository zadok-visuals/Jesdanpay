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

export function IndividualKycForm({ userId, country }: { userId: string; country: string | null }) {
  const [state, formAction, pending] = useActionState(submitIndividualKyc, initialState);
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [bvnOrNin, setBvnOrNin] = useState("");
  const [govIdNumber, setGovIdNumber] = useState("");
  const [govIdType, setGovIdType] = useState("");
  const [governmentIdPath, setGovernmentIdPath] = useState<string | null>(null);
  const [proofOfAddressPath, setProofOfAddressPath] = useState<string | null>(null);

  // Same NG check the server itself makes from the stored profile — this one only decides which
  // fields to SHOW, the server in submitIndividualKyc independently re-derives it from the
  // database, never trusting this client-side value for what gets written.
  const isNigerian = country === "NG";

  const canContinueStep1 = phone.trim().length > 0;
  const identityFieldsFilled = isNigerian
    ? bvnOrNin.trim().length > 0
    : govIdNumber.trim().length > 0 && govIdType.trim().length > 0;
  const canContinueStep2 = identityFieldsFilled && governmentIdPath !== null;

  let continueDisabledReason: string | null = null;
  if (step === 1 && !canContinueStep1) {
    continueDisabledReason = "Enter your phone number to continue";
  } else if (step === 2 && !canContinueStep2) {
    if (isNigerian) {
      if (!bvnOrNin.trim() && !governmentIdPath) {
        continueDisabledReason = "Enter your BVN or NIN and upload your ID to continue";
      } else if (!bvnOrNin.trim()) {
        continueDisabledReason = "Enter your BVN or NIN to continue";
      } else {
        continueDisabledReason = "Upload your ID to continue";
      }
    } else if (!govIdNumber.trim() && !govIdType.trim() && !governmentIdPath) {
      continueDisabledReason = "Enter your Gov ID No, the ID type and upload your ID to continue";
    } else if (!govIdNumber.trim()) {
      continueDisabledReason = "Enter your Gov ID No to continue";
    } else if (!govIdType.trim()) {
      continueDisabledReason = "Enter the ID type to continue";
    } else {
      continueDisabledReason = "Upload your ID to continue";
    }
  }

  return (
    <Card className="p-6 sm:p-8">
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
            Raises your limit. Provide your identity details and a photo of your government
            issued ID.
          </p>

          {isNigerian ? (
            <Input
              label="BVN or NIN"
              id="bvnOrNin"
              name="bvnOrNin"
              type="text"
              value={bvnOrNin}
              onChange={(e) => setBvnOrNin(e.target.value)}
            />
          ) : (
            <>
              <Input
                label="Gov ID No"
                id="govIdNumber"
                name="govIdNumber"
                type="text"
                value={govIdNumber}
                onChange={(e) => setGovIdNumber(e.target.value)}
              />
              <Input
                label="What ID is this?"
                id="govIdType"
                name="govIdType"
                type="text"
                placeholder="e.g. Passport, Ghana Card, National ID, Driver's licence"
                value={govIdType}
                onChange={(e) => setGovIdType(e.target.value)}
              />
            </>
          )}

          <p className="text-xs text-foreground/50">
            Upload a clear photo of the ID you entered above. Accepted: passport, driver&rsquo;s
            licence, national ID or voter&rsquo;s card.
          </p>
          <FileDropzone
            label="Government issued ID"
            accept="image/*,.pdf"
            bucket="kyc-documents"
            userId={userId}
            prefix="tier2-government-id"
            path={governmentIdPath}
            onUploaded={setGovernmentIdPath}
          />
        </div>

        <div className={step === 3 ? "flex flex-col gap-4" : "hidden"}>
          <h1 className="mb-1 text-lg font-semibold">Tier 3 — Proof of address</h1>
          <p className="mb-2 text-sm text-foreground/60">
            Unlocks your highest transaction limit. A recent utility bill or bank statement works.
          </p>
          <FileDropzone
            label="Proof of address"
            accept="image/*,.pdf"
            bucket="kyc-documents"
            userId={userId}
            prefix="tier3-address"
            path={proofOfAddressPath}
            onUploaded={setProofOfAddressPath}
          />
        </div>

        {isNigerian ? (
          <input type="hidden" name="bvnOrNin" value={bvnOrNin} />
        ) : (
          <>
            <input type="hidden" name="govIdNumber" value={govIdNumber} />
            <input type="hidden" name="govIdType" value={govIdType} />
          </>
        )}
        <input type="hidden" name="governmentId" value={governmentIdPath ?? ""} />
        <input type="hidden" name="proofOfAddress" value={proofOfAddressPath ?? ""} />

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
            <div className="flex flex-col items-end gap-1.5">
              <Button
                type="button"
                disabled={step === 1 ? !canContinueStep1 : !canContinueStep2}
                onClick={() => setStep(step + 1)}
                title={continueDisabledReason ?? undefined}
              >
                Continue
              </Button>
              {continueDisabledReason && (
                <p className="text-xs text-foreground/50">{continueDisabledReason}</p>
              )}
            </div>
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

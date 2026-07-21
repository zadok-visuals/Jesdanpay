"use client";

import { useActionState, useState } from "react";
import { submitBusinessKyc, type KycActionState } from "@/lib/actions/kyc";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { StepIndicator } from "@/components/ui/StepIndicator";

const initialState: KycActionState = {};
const TOTAL_STEPS = 4;

export default function BusinessKycPage() {
  const [state, formAction, pending] = useActionState(submitBusinessKyc, initialState);
  const [step, setStep] = useState(1);
  const [businessName, setBusinessName] = useState("");
  const [tin, setTin] = useState("");
  const [ownershipStructure, setOwnershipStructure] = useState("");
  const [cacCertificate, setCacCertificate] = useState<File | null>(null);
  const [directorId, setDirectorId] = useState<File | null>(null);
  const [proofOfBusinessAddress, setProofOfBusinessAddress] = useState<File | null>(null);

  const canContinue: Record<number, boolean> = {
    1: businessName.trim().length > 0 && tin.trim().length > 0,
    2: cacCertificate !== null,
    3: directorId !== null,
  };

  return (
    <Card className="p-6 sm:p-8">
      <StepIndicator step={step} total={TOTAL_STEPS} />

      <form action={formAction} className="flex flex-col gap-4">
        <div className={step === 1 ? "flex flex-col gap-4" : "hidden"}>
          <h1 className="mb-1 text-lg font-semibold">Business details</h1>
          <Input
            label="Registered business name"
            id="businessName"
            name="businessName"
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
          <Input
            label="Tax Identification Number (TIN)"
            id="tin"
            name="tin"
            type="text"
            value={tin}
            onChange={(e) => setTin(e.target.value)}
          />
        </div>

        <div className={step === 2 ? "flex flex-col gap-4" : "hidden"}>
          <h1 className="mb-1 text-lg font-semibold">Incorporation & ownership</h1>
          <FileDropzone
            label="CAC certificate"
            accept="image/*,.pdf"
            onFileSelected={setCacCertificate}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground/80">Ownership structure</span>
            <textarea
              name="ownershipStructure"
              rows={3}
              placeholder="List directors/shareholders and their ownership %"
              value={ownershipStructure}
              onChange={(e) => setOwnershipStructure(e.target.value)}
              className="rounded-xl border border-border bg-white p-3.5 text-sm outline-none focus:border-primary-400"
            />
          </label>
        </div>

        <div className={step === 3 ? "flex flex-col gap-4" : "hidden"}>
          <h1 className="mb-1 text-lg font-semibold">Director identification</h1>
          <FileDropzone
            label="Director's government-issued ID"
            accept="image/*,.pdf"
            onFileSelected={setDirectorId}
          />
        </div>

        <div className={step === 4 ? "flex flex-col gap-4" : "hidden"}>
          <h1 className="mb-1 text-lg font-semibold">Proof of business address</h1>
          <FileDropzone
            label="Utility bill or lease agreement"
            accept="image/*,.pdf"
            onFileSelected={setProofOfBusinessAddress}
          />
        </div>

        <FileInputBridge name="cacCertificate" file={cacCertificate} />
        <FileInputBridge name="directorId" file={directorId} />
        <FileInputBridge name="proofOfBusinessAddress" file={proofOfBusinessAddress} />

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
              disabled={canContinue[step] === false}
              onClick={() => setStep(step + 1)}
            >
              Continue
            </Button>
          ) : (
            <Button type="submit" loading={pending} disabled={proofOfBusinessAddress === null}>
              {pending ? "Submitting…" : "Submit for review"}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

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

import Link from "next/link";
import type { KycStatus, KycType } from "@/lib/types/database";
import { Button } from "@/components/ui/Button";

type Tone = "warning" | "danger";

// "rejected" isn't in this table — its copy/href depend on kycType and kycRejectionReason
// (props, not static), so it's handled as its own branch below instead.
const COPY: Record<Exclude<KycStatus, "approved" | "rejected">, { title: string; href: string; cta: string; tone: Tone }> = {
  not_started: {
    title: "Complete your KYC to unlock full transaction limits.",
    href: "/onboarding/kyc",
    cta: "Start verification",
    tone: "warning",
  },
  pending: {
    title: "Your verification is being reviewed.",
    href: "/onboarding/kyc/status",
    cta: "View status",
    tone: "warning",
  },
};

const TONE_CLASSES: Record<Tone, { card: string; text: string; icon: string; button: string }> = {
  warning: {
    card: "border-l-4 border-accent-300 bg-accent-50",
    text: "text-accent-900",
    icon: "text-accent-500",
    button: "bg-accent-500 text-white hover:bg-accent-600",
  },
  danger: {
    card: "border-l-4 border-danger-500 bg-danger-50",
    text: "text-danger-700",
    icon: "text-danger-500",
    button: "bg-danger-500 text-white hover:opacity-90",
  },
};

function WarningIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" strokeLinecap="round" />
      <path d="M12 16h.01" strokeLinecap="round" />
    </svg>
  );
}

export function KycStatusBanner({
  status,
  kycType,
  kycRejectionReason,
}: {
  status: KycStatus;
  kycType?: KycType | null;
  kycRejectionReason?: string | null;
}) {
  if (status === "approved") return null;

  if (status === "rejected") {
    const tone = TONE_CLASSES.danger;
    // Same form the user originally submitted — resubmission must go to the matching form, not a
    // generic KYC start page (an individual filling the business form, or vice versa, would just
    // produce another rejection).
    const href = kycType === "business" ? "/onboarding/kyc/business" : "/onboarding/kyc/individual";

    return (
      <div className={`flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between ${tone.card}`}>
        <div className="flex min-w-0 items-center gap-3">
          <WarningIcon className={`h-5 w-5 shrink-0 ${tone.icon}`} />
          <p className={`min-w-0 line-clamp-2 text-sm font-medium sm:line-clamp-1 ${tone.text}`}>
            Your verification needs another look.
            {kycRejectionReason && <span className="font-normal opacity-90"> {kycRejectionReason}</span>}
          </p>
        </div>
        <Link href={href} className="shrink-0">
          <Button size="sm" className={`w-full sm:w-auto ${tone.button}`}>
            Fix and resubmit
          </Button>
        </Link>
      </div>
    );
  }

  const copy = COPY[status];
  const tone = TONE_CLASSES[copy.tone];

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between ${tone.card}`}
    >
      <div className="flex items-center gap-3">
        <WarningIcon className={`h-5 w-5 shrink-0 ${tone.icon}`} />
        <p className={`text-sm font-medium ${tone.text}`}>{copy.title}</p>
      </div>
      <Link href={copy.href} className="shrink-0">
        <Button size="sm" className={`w-full sm:w-auto ${tone.button}`}>
          {copy.cta}
        </Button>
      </Link>
    </div>
  );
}

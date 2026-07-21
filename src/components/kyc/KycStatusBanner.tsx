import Link from "next/link";
import type { KycStatus } from "@/lib/types/database";
import { Button } from "@/components/ui/Button";

type Tone = "warning" | "danger";

const COPY: Record<
  Exclude<KycStatus, "approved">,
  { title: string; href: string; cta: string; tone: Tone }
> = {
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
  rejected: {
    title: "Your verification needs another look.",
    href: "/onboarding/kyc/status",
    cta: "Review",
    tone: "danger",
  },
};

const TONE_CLASSES: Record<Tone, { card: string; text: string; icon: string; button: string }> = {
  warning: {
    card: "border-l-4 border-accent-500 bg-accent-100",
    text: "text-accent-900",
    icon: "text-accent-600",
    button: "bg-accent-500 text-white hover:bg-accent-600",
  },
  danger: {
    card: "border-l-4 border-danger-500 bg-danger-50",
    text: "text-danger-700",
    icon: "text-danger-500",
    button: "bg-danger-500 text-white hover:opacity-90",
  },
};

export function KycStatusBanner({ status }: { status: KycStatus }) {
  if (status === "approved") return null;
  const copy = COPY[status];
  const tone = TONE_CLASSES[copy.tone];

  return (
    <div className={`flex items-center justify-between gap-4 rounded-2xl p-4 ${tone.card}`}>
      <div className="flex items-center gap-3">
        <svg
          className={`h-5 w-5 shrink-0 ${tone.icon}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" strokeLinecap="round" />
          <path d="M12 16h.01" strokeLinecap="round" />
        </svg>
        <p className={`text-sm font-medium ${tone.text}`}>{copy.title}</p>
      </div>
      <Link href={copy.href}>
        <Button size="sm" className={tone.button}>
          {copy.cta}
        </Button>
      </Link>
    </div>
  );
}

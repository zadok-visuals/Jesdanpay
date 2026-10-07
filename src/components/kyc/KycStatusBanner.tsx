import Link from "next/link";
import type { KycStatus, KycType } from "@/lib/types/database";
import { Button } from "@/components/ui/Button";

type Tone = "warning" | "danger";

// Pending is the only status left with a single, static copy/href pair — not_started now
// branches on whether quick onboarding (account type + phone) has happened yet (see the
// component below), and rejected already depended on props (kycType/kycRejectionReason), so both
// are handled as their own branches instead of living in this table.
const PENDING_COPY = {
  title: "Your verification is being reviewed.",
  href: "/onboarding/kyc/status",
  cta: "View status",
};

// No coloured left border — removed to match the rest of the app after the landing-page audit
// dropped them elsewhere; everything else about the look (background tint, text/icon/button
// colours) is unchanged.
const TONE_CLASSES: Record<Tone, { card: string; text: string; icon: string; button: string }> = {
  warning: {
    card: "bg-accent-50",
    text: "text-accent-900",
    icon: "text-accent-500",
    button: "bg-accent-500 text-white hover:bg-accent-600",
  },
  danger: {
    card: "bg-danger-50",
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

function BannerRow({
  tone,
  title,
  href,
  cta,
}: {
  tone: Tone;
  title: React.ReactNode;
  href: string;
  cta: string;
}) {
  const classes = TONE_CLASSES[tone];
  return (
    <div className={`flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between ${classes.card}`}>
      <div className="flex min-w-0 items-center gap-3">
        <WarningIcon className={`h-5 w-5 shrink-0 ${classes.icon}`} />
        <p className={`min-w-0 line-clamp-2 text-sm font-medium sm:line-clamp-1 ${classes.text}`}>{title}</p>
      </div>
      <Link href={href} className="shrink-0">
        <Button size="sm" className={`w-full sm:w-auto ${classes.button}`}>
          {cta}
        </Button>
      </Link>
    </div>
  );
}

export function KycStatusBanner({
  status,
  phone,
  kycType,
  kycRejectionReason,
}: {
  status: KycStatus;
  phone?: string | null;
  kycType?: KycType | null;
  kycRejectionReason?: string | null;
}) {
  if (status === "approved") return null;

  if (status === "rejected") {
    // Same form the user originally submitted — resubmission must go to the matching form, not a
    // generic KYC start page (an individual filling the business form, or vice versa, would just
    // produce another rejection).
    const href = kycType === "business" ? "/onboarding/kyc/business" : "/onboarding/kyc/individual";
    return (
      <BannerRow
        tone="danger"
        href={href}
        cta="Fix and resubmit"
        title={
          <>
            Your verification needs another look.
            {kycRejectionReason && <span className="font-normal opacity-90"> {kycRejectionReason}</span>}
          </>
        }
      />
    );
  }

  if (status === "not_started") {
    // Quick onboarding (account type + phone) hasn't happened yet — send them there first, not
    // straight to an ID form that needs both already on file.
    if (!phone || !kycType) {
      return <BannerRow tone="warning" href="/onboarding/kyc" cta="Continue" title="Finish setting up your account." />;
    }
    const href = kycType === "business" ? "/onboarding/kyc/business" : "/onboarding/kyc/individual";
    return (
      <BannerRow
        tone="warning"
        href={href}
        cta="Submit your ID"
        title="Complete your KYC to unlock full transaction limits."
      />
    );
  }

  // pending
  return <BannerRow tone="warning" href={PENDING_COPY.href} cta={PENDING_COPY.cta} title={PENDING_COPY.title} />;
}

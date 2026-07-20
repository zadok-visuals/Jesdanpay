import Link from "next/link";
import type { KycStatus } from "@/lib/types/database";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const COPY: Record<Exclude<KycStatus, "approved">, { title: string; href: string; cta: string }> = {
  not_started: {
    title: "Complete your KYC to unlock full transaction limits.",
    href: "/onboarding/kyc",
    cta: "Start verification",
  },
  pending: {
    title: "Your verification is being reviewed.",
    href: "/onboarding/kyc/status",
    cta: "View status",
  },
  rejected: {
    title: "Your verification needs another look.",
    href: "/onboarding/kyc/status",
    cta: "Review",
  },
};

export function KycStatusBanner({ status }: { status: KycStatus }) {
  if (status === "approved") return null;
  const copy = COPY[status];

  return (
    <Card className="flex items-center justify-between gap-4 border-accent-200 bg-accent-50 p-4">
      <p className="text-sm font-medium text-accent-900">{copy.title}</p>
      <Link href={copy.href}>
        <Button size="sm" variant="secondary">
          {copy.cta}
        </Button>
      </Link>
    </Card>
  );
}

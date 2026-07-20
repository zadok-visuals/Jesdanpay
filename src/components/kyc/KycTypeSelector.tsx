import Link from "next/link";
import { Card } from "@/components/ui/Card";

const options = [
  {
    href: "/onboarding/kyc/individual",
    title: "Individual",
    description: "Verify as a person. Phone/email, ID, and address checks by tier.",
  },
  {
    href: "/onboarding/kyc/business",
    title: "Business",
    description: "Verify as a registered business. CAC, TIN, and director details.",
  },
] as const;

export function KycTypeSelector() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {options.map((option) => (
        <Link key={option.href} href={option.href}>
          <Card className="h-full p-6 transition-colors hover:border-primary-300">
            <h3 className="mb-1.5 text-base font-semibold">{option.title}</h3>
            <p className="text-sm text-foreground/60">{option.description}</p>
          </Card>
        </Link>
      ))}
    </div>
  );
}

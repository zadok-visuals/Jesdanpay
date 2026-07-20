import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Pill, statusTone } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";

const STATUS_COPY: Record<string, string> = {
  pending: "We're reviewing your submission. This usually takes 1-2 business days.",
  approved: "You're verified! You now have full access to JesDanPay.",
  rejected: "We couldn't verify your details. Please review and resubmit.",
};

export default async function KycStatusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("kyc_status, kyc_type")
    .eq("id", user.id)
    .single();

  if (!profile || profile.kyc_status === "not_started") {
    redirect("/onboarding/kyc");
  }

  return (
    <Card className="p-8 text-center">
      <div className="mb-4 flex justify-center">
        <Pill tone={statusTone(profile.kyc_status)}>{profile.kyc_status}</Pill>
      </div>
      <h1 className="mb-2 text-xl font-semibold">Verification {profile.kyc_status}</h1>
      <p className="mb-6 text-sm text-foreground/60">{STATUS_COPY[profile.kyc_status]}</p>

      <div className="flex justify-center gap-3">
        {profile.kyc_status === "rejected" && (
          <Link href={profile.kyc_type === "business" ? "/onboarding/kyc/business" : "/onboarding/kyc/individual"}>
            <Button variant="secondary">Resubmit</Button>
          </Link>
        )}
        <Link href="/home">
          <Button>Continue to dashboard</Button>
        </Link>
      </div>
    </Card>
  );
}

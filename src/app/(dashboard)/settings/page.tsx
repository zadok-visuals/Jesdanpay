import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Pill, statusTone } from "@/components/ui/Pill";
import { WithdrawalRecipientCard } from "@/components/wallet/WithdrawalRecipientCard";
import { TransactionPinCard } from "@/components/wallet/TransactionPinCard";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-4 last:border-0">
      <span className="text-sm text-foreground/60">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: withdrawalRecipient }, { data: wallets }, { data: withdrawalPin }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email, phone, business_name, kyc_type, kyc_status, created_at")
        .eq("id", user.id)
        .single(),
      supabase.from("withdrawal_recipients").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("wallets").select("currency").eq("user_id", user.id),
      supabase.from("withdrawal_pins").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Settings</h1>

      <div className="flex flex-col gap-6">
        <Card className="p-6">
          <h2 className="mb-2 text-base font-semibold">Profile</h2>
          <div className="flex flex-col">
            <Field label="Full name" value={profile?.full_name || "—"} />
            <Field label="Email" value={profile?.email ?? user.email ?? "—"} />
            <Field label="Phone" value={profile?.phone || "—"} />
            {profile?.kyc_type === "business" && (
              <Field label="Business name" value={profile?.business_name || "—"} />
            )}
            <Field
              label="Member since"
              value={
                profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString("en-US")
                  : "—"
              }
            />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-2 text-base font-semibold">Verification</h2>
          <div className="flex flex-col">
            <div className="flex items-center justify-between border-b border-border py-4 last:border-0">
              <span className="text-sm text-foreground/60">Account type</span>
              <span className="text-sm font-medium capitalize">
                {profile?.kyc_type ?? "Not set"}
              </span>
            </div>
            <div className="flex items-center justify-between py-4">
              <span className="text-sm text-foreground/60">KYC status</span>
              <Pill tone={statusTone(profile?.kyc_status ?? "not_started")}>
                {profile?.kyc_status ?? "not_started"}
              </Pill>
            </div>
          </div>
        </Card>

        <WithdrawalRecipientCard
          recipient={withdrawalRecipient ?? null}
          availableCurrencies={(wallets ?? [])
            .map((w) => w.currency)
            .filter((c) => c === "NGN" || c === "GHS" || c === "KES" || c === "USDT")}
        />

        <TransactionPinCard hasPin={!!withdrawalPin} />

        <Card className="p-6">
          <h2 className="mb-1 text-base font-semibold">Notifications & security</h2>
          <p className="text-sm text-foreground/50">
            Notification preferences, password changes, and two-factor authentication are coming
            in a later update.
          </p>
        </Card>
      </div>
    </div>
  );
}

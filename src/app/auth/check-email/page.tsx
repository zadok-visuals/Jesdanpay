import { Wordmark } from "@/components/layout/Wordmark";
import { Card } from "@/components/ui/Card";

export default function CheckEmailPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8">
        <Wordmark />
      </div>
      <Card className="w-full max-w-sm p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-foreground/60">
          We&apos;ve sent you a confirmation link. Click it to activate your account and continue
          setting up JesDanPay.
        </p>
      </Card>
    </div>
  );
}

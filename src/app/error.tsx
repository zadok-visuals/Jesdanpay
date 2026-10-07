"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/layout/Wordmark";

const SUPPORT_EMAIL = "support@jesdanpay.net";

// Route-level error boundary (wraps every page below the root layout — see Next's error.js file
// convention) — this is what a user now sees instead of the framework's generic "This page
// couldn't load" page for any unhandled error below this point, including the server-action
// body-size-limit crashes this was added alongside (see src/lib/actions/kyc.ts's header comment).
// Same visual language as src/app/account-suspended/page.tsx (Wordmark, icon circle, Card).
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-sm p-6 text-center sm:p-8">
        <Wordmark className="mx-auto mb-6 h-7" />
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger-50 text-2xl">
          ⚠️
        </div>
        <h1 className="mb-1 text-xl font-semibold">Something went wrong</h1>
        <p className="mb-6 text-sm text-foreground/60">
          We hit a snag loading this page. Please try again — if it keeps happening, contact us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary-600 hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <Button onClick={() => unstable_retry()}>Try again</Button>
      </Card>
    </div>
  );
}

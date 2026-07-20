import { Wordmark } from "@/components/layout/Wordmark";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center bg-background px-4 py-12">
      <div className="mb-8">
        <Wordmark />
      </div>
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}

import { Card } from "@/components/ui/Card";

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">{title}</h1>
      <Card className="flex flex-col items-center justify-center gap-1 py-20 text-center">
        <p className="text-sm font-medium text-foreground/60">Coming soon</p>
        <p className="max-w-sm text-xs text-foreground/40">{description}</p>
      </Card>
    </div>
  );
}

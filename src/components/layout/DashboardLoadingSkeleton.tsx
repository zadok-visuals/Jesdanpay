import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

export function DashboardLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-14 w-full" />
      <Card className="p-8">
        <Skeleton className="mb-4 h-4 w-24" />
        <Skeleton className="h-10 w-40" />
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Card className="p-6">
        <Skeleton className="h-48 w-full" />
      </Card>
    </div>
  );
}

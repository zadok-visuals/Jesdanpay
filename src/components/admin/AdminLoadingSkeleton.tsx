import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

// Same reuse-the-Skeleton-primitive pattern as DashboardLoadingSkeleton — sized for the admin
// panel's list-of-cards layout instead of the balance-card layout.
export function AdminLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-6 w-48" />
      <Card className="p-5">
        <Skeleton className="h-16 w-full" />
      </Card>
      <Card className="p-5">
        <Skeleton className="h-16 w-full" />
      </Card>
      <Card className="p-5">
        <Skeleton className="h-16 w-full" />
      </Card>
    </div>
  );
}

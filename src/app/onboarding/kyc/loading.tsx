import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-2 h-6 w-56" />
      <Skeleton className="mb-6 h-4 w-80" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="h-32 p-6">
          <Skeleton className="h-full w-full" />
        </Card>
        <Card className="h-32 p-6">
          <Skeleton className="h-full w-full" />
        </Card>
      </div>
    </div>
  );
}

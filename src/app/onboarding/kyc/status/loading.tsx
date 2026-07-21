import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <Card className="p-8 text-center">
      <div className="mb-4 flex justify-center">
        <Skeleton className="h-6 w-20" />
      </div>
      <Skeleton className="mx-auto mb-2 h-6 w-48" />
      <Skeleton className="mx-auto mb-6 h-4 w-64" />
      <Skeleton className="mx-auto h-10 w-40" />
    </Card>
  );
}

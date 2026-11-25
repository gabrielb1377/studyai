import { RouteLoading } from "@/components/route-states";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <RouteLoading label="Carregando Planejamento">
      <div className="space-y-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-10 w-72 max-w-full" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="h-80 p-5 space-y-4">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-48 w-full" />
        </Card>
        <Card className="h-80 p-5 space-y-4">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-48 w-full" />
        </Card>
      </div>
    </RouteLoading>
  );
}

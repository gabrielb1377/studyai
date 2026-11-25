import { RouteLoading } from "@/components/route-states";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <RouteLoading label="Carregando Conta">
      <div className="space-y-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-10 w-60 max-w-full" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="h-80 p-6 space-y-4">
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-10 w-full" />
        </Card>
        <Card className="h-80 p-6 space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </Card>
      </div>
    </RouteLoading>
  );
}

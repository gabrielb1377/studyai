import { RouteLoading } from "@/components/route-states";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <RouteLoading label="Carregando Diagnóstico de Storage">
      <div className="space-y-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-9 w-48 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="h-32 p-5 space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-20" />
          </Card>
        ))}
      </div>
      <Card className="h-80 p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-48 w-full" />
      </Card>
    </RouteLoading>
  );
}

import { RouteLoading } from "@/components/route-states";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <RouteLoading label="Carregando Salas de Estudo">
      <div className="space-y-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-56 max-w-full" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Card className="h-96 p-4 space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </Card>
        <Card className="h-96 p-6 space-y-4">
          <Skeleton className="h-7 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-44 w-full" />
        </Card>
      </div>
    </RouteLoading>
  );
}

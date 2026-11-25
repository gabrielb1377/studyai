import { RouteLoading } from "@/components/route-states";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <RouteLoading label="Carregando Área de Estudo">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Skeleton className="h-[32rem] rounded-2xl" />
        <Skeleton className="h-[32rem] rounded-2xl" />
      </div>
    </RouteLoading>
  );
}

import { RouteLoading } from "@/components/route-states";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <RouteLoading label="Carregando Aprendizagem Personalizada">
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-80 max-w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="h-72 p-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-4 h-48 w-full" />
        </Card>
        <Card className="h-72 p-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-4 h-48 w-full" />
        </Card>
      </div>
    </RouteLoading>
  );
}

import { RouteLoading } from "@/components/route-states";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <RouteLoading label="Carregando Tutor IA">
      <div className="space-y-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-9 w-40 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Card className="flex h-[30rem] flex-col justify-between p-6">
        <div className="space-y-4">
          <div className="flex gap-3">
            <Skeleton className="size-8 rounded-full shrink-0" />
            <Skeleton className="h-16 w-3/4 rounded-2xl" />
          </div>
          <div className="flex justify-end gap-3">
            <Skeleton className="h-12 w-1/2 rounded-2xl" />
          </div>
        </div>
        <div className="pt-4 border-t">
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </Card>
    </RouteLoading>
  );
}

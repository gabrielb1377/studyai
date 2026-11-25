import { RouteLoading } from "@/components/route-states";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrganizationLoading() {
  return (
    <RouteLoading label="Carregando organização">
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </RouteLoading>
  );
}

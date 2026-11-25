import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function RouteLoading({
  label,
  children,
}: {
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className="space-y-6 motion-safe:animate-pulse"
    >
      <span className="sr-only">{label}...</span>
      <div aria-hidden="true" className="space-y-6">
        {children ?? (
          <>
            <div className="space-y-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-10 w-64 max-w-full" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <Card key={item} className="h-56 p-5">
                  <Skeleton className="size-10 rounded-xl" />
                  <Skeleton className="mt-4 h-5 w-3/4" />
                  <Skeleton className="mt-3 h-4 w-full" />
                  <Skeleton className="mt-2 h-4 w-2/3" />
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function RouteErrorState({
  title,
  description = "Algo não saiu como esperado ao abrir esta página. Tente carregar novamente.",
  onRetry,
}: {
  title: string;
  description?: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="py-4">
      <EmptyState icon={TriangleAlert} title={title} description={description}>
        <Button variant="outline" onClick={onRetry}>
          Tentar novamente
        </Button>
      </EmptyState>
    </div>
  );
}

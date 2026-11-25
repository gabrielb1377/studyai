"use client";

import { RouteErrorState } from "@/components/route-states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      title="Não foi possível carregar o Diagnóstico de Storage"
      description="Algo falhou ao inspecionar o armazenamento local ou quotas. Tente novamente."
      onRetry={reset}
    />
  );
}

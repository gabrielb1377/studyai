"use client";

import { RouteErrorState } from "@/components/route-states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      title="Não foi possível abrir este espaço"
      description="Algo não saiu como esperado. Tente carregar a página novamente."
      onRetry={reset}
    />
  );
}

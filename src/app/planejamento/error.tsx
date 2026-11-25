"use client";

import { RouteErrorState } from "@/components/route-states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      title="Não foi possível carregar o Planejamento"
      description="Algo não saiu como esperado ao montar seu cronograma de estudos. Tente novamente."
      onRetry={reset}
    />
  );
}

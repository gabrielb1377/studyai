"use client";

import { RouteErrorState } from "@/components/route-states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      title="Não foi possível carregar o Academy"
      description="Algo não saiu como esperado ao carregar seus estudos e trilhas. Tente novamente."
      onRetry={reset}
    />
  );
}

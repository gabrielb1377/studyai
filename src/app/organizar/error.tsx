"use client";

import { RouteErrorState } from "@/components/route-states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      title="Não foi possível carregar a organização"
      description="Ocorreu um erro ao estruturar seus materiais e pastas. Tente novamente."
      onRetry={reset}
    />
  );
}

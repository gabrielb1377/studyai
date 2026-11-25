"use client";

import { RouteErrorState } from "@/components/route-states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      title="Não foi possível carregar as Provas"
      description="Ocorreu um erro ao acessar seu calendário de avaliações e revisões. Tente novamente."
      onRetry={reset}
    />
  );
}

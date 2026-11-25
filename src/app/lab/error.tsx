"use client";

import { RouteErrorState } from "@/components/route-states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      title="Não foi possível carregar o Laboratório"
      description="Ocorreu um erro ao inicializar o ambiente de exercícios práticos. Tente novamente."
      onRetry={reset}
    />
  );
}

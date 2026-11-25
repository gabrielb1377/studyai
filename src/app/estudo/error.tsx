"use client";

import { RouteErrorState } from "@/components/route-states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      title="Não foi possível abrir o Estudo"
      description="Ocorreu um erro ao carregar o workspace de estudo ou os materiais selecionados. Tente novamente."
      onRetry={reset}
    />
  );
}

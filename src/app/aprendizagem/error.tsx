"use client";

import { RouteErrorState } from "@/components/route-states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      title="Não foi possível carregar a Aprendizagem Personalizada"
      description="Ocorreu um erro ao recuperar seu mapa de domínio e caderno de erros. Tente novamente."
      onRetry={reset}
    />
  );
}

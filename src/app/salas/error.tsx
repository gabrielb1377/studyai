"use client";

import { RouteErrorState } from "@/components/route-states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      title="Não foi possível carregar as Salas de Estudo"
      description="Ocorreu um erro ao conectar ao serviço de colaboração. Tente novamente."
      onRetry={reset}
    />
  );
}

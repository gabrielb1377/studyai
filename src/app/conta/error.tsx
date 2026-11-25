"use client";

import { RouteErrorState } from "@/components/route-states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      title="Não foi possível carregar a Conta"
      description="Ocorreu um erro ao verificar sua sessão e perfil. Tente novamente."
      onRetry={reset}
    />
  );
}

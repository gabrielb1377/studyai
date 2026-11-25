"use client";

import { RouteErrorState } from "@/components/route-states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      title="Não foi possível carregar as Configurações"
      description="Ocorreu uma falha ao acessar as preferências locais. Tente carregar novamente."
      onRetry={reset}
    />
  );
}

"use client";

import { RouteErrorState } from "@/components/route-states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      title="Não foi possível abrir a importação de materiais"
      description="Algo não saiu como esperado ao inicializar o processador de arquivos. Tente novamente."
      onRetry={reset}
    />
  );
}

"use client";

import { RouteErrorState } from "@/components/route-states";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <RouteErrorState
      title="Não foi possível abrir o Tutor IA"
      description="Ocorreu um erro ao carregar o histórico de conversa ou o serviço do Tutor. Tente novamente."
      onRetry={reset}
    />
  );
}

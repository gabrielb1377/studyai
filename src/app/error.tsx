"use client";

import { RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <EmptyState
      icon={RefreshCw}
      title="Não foi possível abrir este espaço"
      description="Algo não saiu como esperado. Tente carregar a página novamente."
    >
      <Button onClick={reset}>Tentar novamente</Button>
    </EmptyState>
  );
}

"use client";

import "@/styles/globals.css";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-dvh items-center justify-center bg-background p-4 text-foreground">
        <div role="alert" className="max-w-md text-center space-y-4">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border bg-muted text-primary shadow-sm">
            <RefreshCw className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Ocorreu um erro inesperado</h1>
          <p className="text-sm text-muted-foreground">
            O aplicativo encontrou uma falha grave na inicialização. Tente recarregar para restaurar a sessão.
          </p>
          <Button onClick={() => reset()}>Recarregar aplicação</Button>
        </div>
      </body>
    </html>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RotateCw, X } from "lucide-react";
import { StorageManager } from "./StorageManager";

export function StorageBootstrap() {
  const [error, setError] = useState<string | null>(null);

  const initialize = () => {
    setError(null);
    void StorageManager.initialize().catch((cause) => {
      const message = cause instanceof Error
        ? cause.message
        : "Não foi possível iniciar o armazenamento local.";
      setError(message);
      window.dispatchEvent(new CustomEvent("studyai:storage-error", { detail: cause }));
    });
  };

  useEffect(() => {
    initialize();
  }, []);

  if (!error) return null;
  return (
    <div className="fixed inset-x-4 bottom-4 z-[100] mx-auto flex max-w-2xl items-start gap-3 rounded-xl border border-destructive/30 bg-background p-4 shadow-lg" role="alert">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Armazenamento local indisponível</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </div>
      <button type="button" className="rounded-md p-2 hover:bg-accent" onClick={initialize} aria-label="Tentar novamente">
        <RotateCw className="size-4" aria-hidden="true" />
      </button>
      <button type="button" className="rounded-md p-2 hover:bg-accent" onClick={() => setError(null)} aria-label="Fechar aviso">
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

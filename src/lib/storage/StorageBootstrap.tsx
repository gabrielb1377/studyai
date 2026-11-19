"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RotateCw, X } from "lucide-react";
import { STORAGE_ERROR_EVENT, StorageError, StorageManager } from "./StorageManager";

type StorageNotice = {
  code?: string;
  message: string;
};

export function StorageBootstrap() {
  const [notice, setNotice] = useState<StorageNotice | null>(null);

  const initialize = () => {
    setNotice(null);
    void StorageManager.initialize().catch((cause) => {
      const message = cause instanceof Error
        ? cause.message
        : "Não foi possível iniciar o armazenamento local.";
      const code = cause instanceof StorageError ? cause.code : "UNAVAILABLE";
      setNotice({ code, message });
      window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { code, message } }));
    });
  };

  useEffect(() => {
    initialize();
    const handleStorageError = (event: Event) => {
      const detail = (event as CustomEvent<{ code?: string; message?: string } | Error>).detail;
      if (detail instanceof Error) {
        setNotice({ message: detail.message });
        return;
      }
      if (detail?.message) {
        setNotice({ code: detail.code, message: detail.message });
      }
    };
    window.addEventListener(STORAGE_ERROR_EVENT, handleStorageError);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, handleStorageError);
  }, []);

  if (!notice) return null;
  const title = notice.code === "FULL"
    ? "Espaço de armazenamento local cheio"
    : "Armazenamento local indisponível";

  return (
    <div className="fixed inset-x-4 bottom-4 z-[100] mx-auto flex max-w-2xl items-start gap-3 rounded-xl border border-destructive/30 bg-background p-4 shadow-lg" role="alert">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{notice.message}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          O armazenamento do navegador não é permanente em situações de falta de espaço. Exporte um backup em Conta sempre que precisar preservar seus dados.
        </p>
      </div>
      <button type="button" className="rounded-md p-2 hover:bg-accent" onClick={initialize} aria-label="Tentar novamente">
        <RotateCw className="size-4" aria-hidden="true" />
      </button>
      <button type="button" className="rounded-md p-2 hover:bg-accent" onClick={() => setNotice(null)} aria-label="Fechar aviso">
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

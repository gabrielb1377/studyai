"use client";

import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConnectivity } from "@/features/platform/useConnectivity";

export function ConnectivityBanner() {
  const { status, reconnected, dismissReconnected } = useConnectivity();

  useEffect(() => {
    if (!reconnected || status !== "online") return;
    const timer = window.setTimeout(() => {
      dismissReconnected();
    }, 8_000);
    return () => window.clearTimeout(timer);
  }, [reconnected, status, dismissReconnected]);

  if (status === "offline") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-950 dark:text-amber-100 sm:px-6 lg:px-8"
      >
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-2">
          <WifiOff className="size-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          <p className="min-w-0 flex-1 leading-5">
            <strong>Sem conexão com a internet.</strong> Materiais salvos neste dispositivo, notas, sessões de foco e
            metas semanais continuam funcionando localmente. Tutor IA, sincronização na nuvem e Modo Prova protegido
            aguardam reconexão.
          </p>
        </div>
      </div>
    );
  }

  if (status === "degraded") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-950 dark:text-amber-100 sm:px-6 lg:px-8"
      >
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-2">
          <AlertTriangle className="size-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          <p className="min-w-0 flex-1 leading-5">
            <strong>Serviços remotos inacessíveis no momento.</strong> Suas alterações locais permanecem seguras neste
            dispositivo.
          </p>
        </div>
      </div>
    );
  }

  if (reconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-950 dark:text-emerald-100 sm:px-6 lg:px-8"
      >
        <div className="mx-auto flex max-w-[1560px] items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
            <p className="leading-5">
              <strong>Conexão restabelecida.</strong> Tutor IA, Modo Prova protegido e sincronização estão disponíveis
              novamente.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={dismissReconnected}
            aria-label="Fechar aviso de reconexão"
          >
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

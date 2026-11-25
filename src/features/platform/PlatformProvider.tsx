"use client";

import { useEffect, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileBridge } from "./MobileBridge";
import { PWAService, PWA_UPDATE_EVENT } from "./PWAService";
import { NotificationService } from "./NotificationService";
import { UpdateSafety } from "./UpdateSafety";

export function PlatformProvider() {
  const updateState = useSyncExternalStore(
    UpdateSafety.subscribe,
    UpdateSafety.snapshot,
    UpdateSafety.snapshot,
  );

  useEffect(() => {
    const install = (event: Event) => { event.preventDefault(); PWAService.registerInstallPrompt(event); };
    let reloading = false;
    let hadController = Boolean(navigator.serviceWorker?.controller);
    // Nunca força skipWaiting nem recarrega durante simulado, foco, edição ou sem ação explícita do usuário.
    const update = () => { UpdateSafety.markUpdateAvailable(); };
    const controllerChanged = () => {
      if (!reloading && UpdateSafety.consumeApprovedReload()) {
        reloading = true;
        window.location.reload();
        return;
      }
      if (!hadController) {
        hadController = true;
        return;
      }
      UpdateSafety.markReloadPending();
    };
    window.addEventListener("beforeinstallprompt", install);
    window.addEventListener(PWA_UPDATE_EVENT, update);
    navigator.serviceWorker?.addEventListener("controllerchange", controllerChanged);
    void PWAService.register();
    const stopReviews = NotificationService.startReviewMonitor();
    let dispose: () => void = () => undefined;
    void MobileBridge.initialize().then((remove) => { dispose = remove; });
    return () => {
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener(PWA_UPDATE_EVENT, update);
      navigator.serviceWorker?.removeEventListener("controllerchange", controllerChanged);
      dispose();
      stopReviews();
    };
  }, []);

  if ((!updateState.updateAvailable && !updateState.reloadPending) || updateState.dismissed) {
    return null;
  }

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed right-4 bottom-24 z-50 left-4 max-w-sm rounded-xl border bg-card p-4 text-card-foreground shadow-lg sm:left-auto lg:bottom-4"
    >
      <div className="flex items-start gap-3">
        <RefreshCw className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold">Atualização do StudyAI disponível</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {updateState.busy
              ? `Finalize sua atividade (${updateState.busyLabels.join(", ")}) antes de atualizar para preservar seu progresso.`
              : updateState.reloadPending
                ? "Nova versão pronta. Recarregue quando estiver pronto para aplicar."
                : "Uma nova versão está pronta para ser aplicada com segurança."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={updateState.busy}
              onClick={() => void UpdateSafety.approveAndApply()}
            >
              {updateState.reloadPending ? "Recarregar agora" : "Atualizar agora"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => UpdateSafety.dismiss()}>
              Depois
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

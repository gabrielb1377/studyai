"use client";

import { useEffect } from "react";
import { MobileBridge } from "./MobileBridge";
import { PWAService, PWA_UPDATE_EVENT } from "./PWAService";
import { NotificationService } from "./NotificationService";

export function PlatformProvider() {
  useEffect(() => {
    const install = (event: Event) => { event.preventDefault(); PWAService.registerInstallPrompt(event); };
    let reloading = false;
    const update = () => { void PWAService.activateUpdate(); };
    const controllerChanged = () => { if (!reloading) { reloading = true; window.location.reload(); } };
    window.addEventListener("beforeinstallprompt", install);
    window.addEventListener(PWA_UPDATE_EVENT, update);
    navigator.serviceWorker?.addEventListener("controllerchange", controllerChanged);
    void PWAService.register();
    const stopReviews = NotificationService.startReviewMonitor();
    let dispose: () => void = () => undefined;
    void MobileBridge.initialize().then((remove) => { dispose = remove; });
    return () => { window.removeEventListener("beforeinstallprompt", install); window.removeEventListener(PWA_UPDATE_EVENT, update); navigator.serviceWorker?.removeEventListener("controllerchange", controllerChanged); dispose(); stopReviews(); };
  }, []);
  return null;
}

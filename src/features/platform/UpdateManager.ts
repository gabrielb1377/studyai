import { PWAService } from "./PWAService";

export const UpdateManager = {
  async check() {
    if (window.studyaiDesktop) return window.studyaiDesktop.checkForUpdates();
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
    return { status: registration?.waiting ? "available" : "current" };
  },
  activatePwaUpdate: PWAService.activateUpdate,
};


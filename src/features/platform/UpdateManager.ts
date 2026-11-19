import { UpdateSafety } from "./UpdateSafety";

export const UpdateManager = {
  async check() {
    if (window.studyaiDesktop) return window.studyaiDesktop.checkForUpdates();
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
    if (registration?.waiting) {
      UpdateSafety.markUpdateAvailable();
      return { status: "available" };
    }
    return { status: "current" };
  },
  activatePwaUpdate: () => UpdateSafety.approveAndApply(),
};


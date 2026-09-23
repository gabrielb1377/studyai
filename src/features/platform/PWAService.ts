export const PWA_UPDATE_EVENT = "studyai:pwa-update";

let installPrompt: BeforeInstallPromptEvent | undefined;

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export const PWAService = {
  registerInstallPrompt(event: Event) {
    installPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event("studyai:pwa-installable"));
  },

  canInstall() {
    return Boolean(installPrompt);
  },

  async install() {
    if (!installPrompt) return false;
    await installPrompt.prompt();
    const accepted = (await installPrompt.userChoice).outcome === "accepted";
    if (accepted) installPrompt = undefined;
    return accepted;
  },

  async register() {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent(PWA_UPDATE_EVENT, { detail: registration }));
        }
      });
    });
    window.setInterval(() => void registration.update(), 60 * 60 * 1000);
  },

  async activateUpdate() {
    const registration = await navigator.serviceWorker?.getRegistration();
    registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
  },

  async consumeSharedFiles() {
    if (typeof caches === "undefined") return [] as File[];
    const cache = await caches.open("studyai-shared-v1");
    const manifestResponse = await cache.match("/__shared__/manifest");
    if (!manifestResponse) return [] as File[];
    const manifest = await manifestResponse.json() as Array<{ id: string; name: string; type: string; lastModified: number }>;
    const files: File[] = [];
    for (const item of manifest) {
      const response = await cache.match(`/__shared__/${item.id}`);
      if (response) files.push(new File([await response.blob()], item.name, { type: item.type, lastModified: item.lastModified }));
    }
    await Promise.all((await cache.keys()).map((request) => cache.delete(request)));
    return files;
  },
};

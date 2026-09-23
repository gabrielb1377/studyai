import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export const MOBILE_FILES_EVENT = "studyai:mobile-files";

export const MobileBridge = {
  isNative() {
    return Capacitor.isNativePlatform();
  },
  platform() {
    return Capacitor.getPlatform();
  },
  async initialize() {
    if (!Capacitor.isNativePlatform()) return () => undefined;
    const listener = await App.addListener("appUrlOpen", ({ url }) => {
      window.dispatchEvent(new CustomEvent(MOBILE_FILES_EVENT, { detail: { urls: [url] } }));
    });
    const receiveShare = (event: Event) => {
      const urls = (event as CustomEvent<{ urls?: string[] }>).detail?.urls ?? [];
      if (urls.length) window.dispatchEvent(new CustomEvent(MOBILE_FILES_EVENT, { detail: { urls } }));
    };
    window.addEventListener("studyaiNativeShare", receiveShare);
    window.StudyAINative?.ready();
    return () => { void listener.remove(); window.removeEventListener("studyaiNativeShare", receiveShare); };
  },
  async share(title: string, text: string, url?: string) {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title, text, url, dialogTitle: "Compartilhar pelo StudyAI" });
      return;
    }
    if (navigator.share) await navigator.share({ title, text, url });
  },
  async readSharedFile(uri: string) {
    const result = await Filesystem.readFile({ path: uri });
    if (typeof result.data !== "string") return result.data;
    const bytes = Uint8Array.from(atob(result.data), (character) => character.charCodeAt(0));
    return new Blob([bytes]);
  },
};

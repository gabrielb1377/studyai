import { Capacitor } from "@capacitor/core";
import type { DeviceProfile, PlatformKind } from "./types";

const DEVICE_KEY = "studyai:device-id";

function stableDeviceId() {
  if (typeof localStorage === "undefined") return "server";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function operatingSystem(userAgent: string, platform: string) {
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Mac/i.test(platform)) return "macOS";
  if (/Linux/i.test(platform)) return "Linux";
  return platform || "Sistema desconhecido";
}

export const DeviceManager = {
  id: stableDeviceId,

  detect(): DeviceProfile {
    const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
    const platform = typeof navigator === "undefined" ? "" : navigator.platform;
    const nativePlatform = Capacitor.getPlatform();
    const electron = typeof window !== "undefined" && Boolean(window.studyaiDesktop);
    const standalone = typeof window !== "undefined" && (
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    );
    let kind: PlatformKind = "web";
    if (electron) kind = "electron";
    else if (nativePlatform === "android") kind = "android";
    else if (nativePlatform === "ios") kind = "ios";
    else if (standalone) kind = "pwa";

    const width = typeof window === "undefined" ? 1280 : window.innerWidth;
    const formFactor = width < 640 ? "phone" : width < 1024 ? "tablet" : "desktop";
    const os = electron ? `Desktop ${window.studyaiDesktop?.platform ?? ""}`.trim() : operatingSystem(userAgent, platform);
    const labels: Record<PlatformKind, string> = {
      web: "Navegador",
      pwa: "StudyAI PWA",
      electron: "StudyAI Desktop",
      android: "StudyAI Android",
      ios: "StudyAI iPhone/iPad",
    };
    return { id: stableDeviceId(), kind, name: `${labels[kind]} · ${os}`, operatingSystem: os, formFactor, standalone };
  },
};


export type PlatformKind = "web" | "pwa" | "electron" | "android" | "ios";

export type DeviceProfile = {
  id: string;
  kind: PlatformKind;
  name: string;
  operatingSystem: string;
  formFactor: "desktop" | "tablet" | "phone";
  standalone: boolean;
};

export type PlatformPreferences = {
  launchAtStartup: boolean;
  minimizeToTray: boolean;
  defaultFolder: string;
  autoDownload: boolean;
  wifiOnly: boolean;
  batterySaver: boolean;
  cacheLimitMb: number;
  notifications: boolean;
};

export type PlatformCacheReport = {
  usageBytes: number;
  quotaBytes: number;
  cacheBytes: number;
  cacheNames: string[];
};

export type ElectronBridge = {
  isElectron: true;
  platform: string;
  getVersion(): Promise<string>;
  getLaunchAtStartup(): Promise<boolean>;
  setLaunchAtStartup(value: boolean): Promise<boolean>;
  selectDefaultFolder(): Promise<string | null>;
  setMinimizeToTray(value: boolean): Promise<void>;
  readFile(path: string): Promise<{ data: Uint8Array; name: string; lastModified: number }>;
  showNotification(title: string, body: string): Promise<void>;
  checkForUpdates(): Promise<{ status: string; version?: string; message?: string }>;
  onOpenFiles(callback: (paths: string[]) => void): () => void;
  onUpdateStatus(callback: (status: { status: string; version?: string; message?: string }) => void): () => void;
};

declare global {
  interface Window {
    studyaiDesktop?: ElectronBridge;
    StudyAINative?: { ready(): void };
  }
}

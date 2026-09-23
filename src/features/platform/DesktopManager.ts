export const DesktopManager = {
  available() {
    return typeof window !== "undefined" && Boolean(window.studyaiDesktop);
  },
  bridge() {
    return typeof window === "undefined" ? undefined : window.studyaiDesktop;
  },
  async setLaunchAtStartup(value: boolean) {
    return (await this.bridge()?.setLaunchAtStartup(value)) ?? false;
  },
  async setMinimizeToTray(value: boolean) {
    await this.bridge()?.setMinimizeToTray(value);
  },
  async selectDefaultFolder() {
    return (await this.bridge()?.selectDefaultFolder()) ?? null;
  },
};


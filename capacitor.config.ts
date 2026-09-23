import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.studyai.mobile",
  appName: "StudyAI",
  webDir: "native-shell",
  server: serverUrl ? { url: serverUrl, cleartext: serverUrl.startsWith("http://") } : undefined,
  backgroundColor: "#fafbf9",
  android: { allowMixedContent: false, captureInput: true },
  ios: { contentInset: "automatic", preferredContentMode: "mobile" },
  plugins: {
    LocalNotifications: { smallIcon: "ic_stat_studyai", iconColor: "#29664d" },
    SplashScreen: { launchShowDuration: 1800, backgroundColor: "#fafbf9", showSpinner: true, spinnerColor: "#29664d" },
  },
};

export default config;

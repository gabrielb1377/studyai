import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { StorageManager } from "@/lib/storage/StorageManager";

export type StudyNotification = { title: string; body: string; tag?: string; at?: Date };

export const NotificationService = {
  async permission() {
    if (Capacitor.isNativePlatform()) {
      const current = await LocalNotifications.checkPermissions();
      return current.display === "granted" ? current.display : (await LocalNotifications.requestPermissions()).display;
    }
    if (!("Notification" in window)) return "denied";
    return Notification.permission === "default" ? Notification.requestPermission() : Notification.permission;
  },
  async notify(notification: StudyNotification) {
    const permission = await this.permission();
    if (permission !== "granted") return false;
    if (window.studyaiDesktop) {
      await window.studyaiDesktop.showNotification(notification.title, notification.body);
      return true;
    }
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({ notifications: [{ id: Math.abs([...`${notification.tag ?? notification.title}`].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) | 0, 7)), title: notification.title, body: notification.body, schedule: notification.at ? { at: notification.at } : undefined }] });
      return true;
    }
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.showNotification(notification.title, { body: notification.body, tag: notification.tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" });
    else new Notification(notification.title, { body: notification.body, tag: notification.tag, icon: "/icons/icon-192.png" });
    return true;
  },

  enabled() {
    try { return Boolean((JSON.parse(localStorage.getItem("studyai:platform-settings") || "{}") as { notifications?: boolean }).notifications); } catch { return false; }
  },

  async notifyIfEnabled(notification: StudyNotification) {
    if (!this.enabled()) return false;
    if (!Capacitor.isNativePlatform() && !window.studyaiDesktop && (!("Notification" in window) || Notification.permission !== "granted")) return false;
    return this.notify(notification);
  },

  startReviewMonitor() {
    const check = async () => {
      if (!this.enabled()) return;
      const cards = await StorageManager.getAll<{ nextReviewAt?: string }>("flashcards").catch(() => []);
      const due = cards.filter((card) => card.nextReviewAt && new Date(card.nextReviewAt).getTime() <= Date.now()).length;
      const marker = `${new Date().toISOString().slice(0, 10)}:${due}`;
      if (!due || localStorage.getItem("studyai:last-review-notification") === marker) return;
      const shown = await this.notifyIfEnabled({ title: "Hora de revisar", body: `${due} ${due === 1 ? "flashcard está pronto" : "flashcards estão prontos"} para revisão.`, tag: "study-review" });
      if (shown) localStorage.setItem("studyai:last-review-notification", marker);
    };
    void check();
    const timer = window.setInterval(() => void check(), 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  },
};

"use client";

import { useEffect } from "react";
import { useAuth } from "@/features/account/AuthProvider";
import { STORAGE_UPDATED_EVENT } from "@/lib/storage/StorageManager";
import { CloudSyncManager } from "./CloudSyncManager";
import { NotificationService } from "@/features/platform/NotificationService";

export function CloudSyncProvider() {
  const { session } = useAuth();
  useEffect(() => {
    if (!session) return;
    let timer: number | undefined;
    let notifyWhenComplete = !navigator.onLine;
    const schedule = (event?:Event) => { if(event?.type===STORAGE_UPDATED_EVENT&&(event as CustomEvent<{key?:IDBValidKey}>).detail?.key==="cloud-sync:v1")return;window.clearTimeout(timer); timer = window.setTimeout(() => { void CloudSyncManager.syncNow(); }, 800); };
    const online = () => { void CloudSyncManager.syncNow(); };
    const syncState = (event: Event) => {
      const state = (event as CustomEvent<{ status?: string; lastSyncAt?: string }>).detail;
      if (state.status === "offline" || state.status === "error") notifyWhenComplete = true;
      if (state.status === "idle" && state.lastSyncAt && notifyWhenComplete) {
        notifyWhenComplete = false;
        void NotificationService.notifyIfEnabled({ title: "Sincronização concluída", body: "Suas alterações estão disponíveis nos dispositivos conectados.", tag: "cloud-sync" });
      }
    };
    window.addEventListener(STORAGE_UPDATED_EVENT, schedule); window.addEventListener("studyai:workspace-updated", schedule); window.addEventListener("online", online); window.addEventListener("offline", schedule);
    window.addEventListener("studyai:cloud-sync", syncState);
    void CloudSyncManager.syncNow(); const interval = window.setInterval(online, 60_000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); window.removeEventListener(STORAGE_UPDATED_EVENT, schedule); window.removeEventListener("studyai:workspace-updated", schedule); window.removeEventListener("online", online); window.removeEventListener("offline", schedule); window.removeEventListener("studyai:cloud-sync", syncState); };
  }, [session]);
  return null;
}

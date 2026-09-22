"use client";

import { useEffect } from "react";
import { useAuth } from "@/features/account/AuthProvider";
import { STORAGE_UPDATED_EVENT } from "@/lib/storage/StorageManager";
import { CloudSyncManager } from "./CloudSyncManager";

export function CloudSyncProvider() {
  const { session } = useAuth();
  useEffect(() => {
    if (!session) return;
    let timer: number | undefined;
    const schedule = (event?:Event) => { if(event?.type===STORAGE_UPDATED_EVENT&&(event as CustomEvent<{key?:IDBValidKey}>).detail?.key==="cloud-sync:v1")return;window.clearTimeout(timer); timer = window.setTimeout(() => { void CloudSyncManager.syncNow(); }, 800); };
    const online = () => { void CloudSyncManager.syncNow(); };
    window.addEventListener(STORAGE_UPDATED_EVENT, schedule); window.addEventListener("studyai:workspace-updated", schedule); window.addEventListener("online", online); window.addEventListener("offline", schedule);
    void CloudSyncManager.syncNow(); const interval = window.setInterval(online, 60_000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); window.removeEventListener(STORAGE_UPDATED_EVENT, schedule); window.removeEventListener("studyai:workspace-updated", schedule); window.removeEventListener("online", online); window.removeEventListener("offline", schedule); };
  }, [session]);
  return null;
}

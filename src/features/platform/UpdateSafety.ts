"use client";

import { useEffect } from "react";
import { PWAService } from "./PWAService";

export type UpdateSafetySnapshot = {
  updateAvailable: boolean;
  reloadPending: boolean;
  dismissed: boolean;
  userApprovedApply: boolean;
  busy: boolean;
  busyLabels: string[];
};

const locks = new Map<string, string>();
const listeners = new Set<() => void>();

let updateAvailable = false;
let reloadPending = false;
let dismissed = false;
let userApprovedApply = false;
let cachedSnapshot: UpdateSafetySnapshot = {
  updateAvailable: false,
  reloadPending: false,
  dismissed: false,
  userApprovedApply: false,
  busy: false,
  busyLabels: [],
};

function rebuildSnapshot() {
  const busyLabels = Array.from(new Set(locks.values()));
  cachedSnapshot = {
    updateAvailable,
    reloadPending,
    dismissed,
    userApprovedApply,
    busy: busyLabels.length > 0,
    busyLabels,
  };
}

function notify() {
  rebuildSnapshot();
  for (const listener of listeners) listener();
}

export const UpdateSafety = {
  acquire(id: string, label: string): () => void {
    const previous = locks.get(id);
    locks.set(id, label);
    if (previous !== label) notify();
    return () => {
      if (locks.get(id) === label) {
        locks.delete(id);
        notify();
      }
    };
  },

  isBusy(): boolean {
    return locks.size > 0;
  },

  busyLabels(): string[] {
    return cachedSnapshot.busyLabels;
  },

  snapshot(): UpdateSafetySnapshot {
    return cachedSnapshot;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  markUpdateAvailable() {
    updateAvailable = true;
    dismissed = false;
    notify();
  },

  markReloadPending() {
    reloadPending = true;
    dismissed = false;
    userApprovedApply = false;
    notify();
  },

  dismiss() {
    dismissed = true;
    notify();
  },

  async approveAndApply(): Promise<"applied" | "blocked" | "reloaded" | "no-waiting"> {
    if (this.isBusy()) return "blocked";
    if (reloadPending) {
      window.location.reload();
      return "reloaded";
    }
    const registration = await navigator.serviceWorker?.getRegistration();
    if (!registration?.waiting) {
      updateAvailable = false;
      userApprovedApply = false;
      notify();
      return "no-waiting";
    }
    userApprovedApply = true;
    notify();
    await PWAService.activateUpdate();
    return "applied";
  },

  consumeApprovedReload(): boolean {
    if (!userApprovedApply || this.isBusy()) return false;
    userApprovedApply = false;
    updateAvailable = false;
    reloadPending = false;
    notify();
    return true;
  },

  resetForTests() {
    locks.clear();
    updateAvailable = false;
    reloadPending = false;
    dismissed = false;
    userApprovedApply = false;
    notify();
  },
};

export function useUpdateGuard(active: boolean, id: string, label: string) {
  useEffect(() => {
    if (!active) return;
    return UpdateSafety.acquire(id, label);
  }, [active, id, label]);
}

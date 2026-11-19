import type { PlatformCacheReport } from "./types";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";

const CACHE_PREFIX = "studyai-";

function userScope(): string | null {
  const session = SessionOperationManager.current();
  return session.userId ?? null;
}

function isPrivateCache(name: string): boolean {
  return name.startsWith(`${CACHE_PREFIX}private:`);
}

async function cacheBytes(names: string[]) {
  let total = 0;
  for (const name of names) {
    const cache = await caches.open(name);
    const responses = await Promise.all((await cache.keys()).map((request) => cache.match(request)));
    for (const response of responses) {
      const length = Number(response?.headers.get("content-length") ?? 0);
      if (length > 0) total += length;
      else if (response) total += (await response.clone().blob()).size;
    }
  }
  return total;
}

export const CacheManager = {
  async report(): Promise<PlatformCacheReport> {
    if (typeof caches === "undefined") {
      const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
      return {
        usageBytes: estimate?.usage ?? 0,
        quotaBytes: estimate?.quota ?? 0,
        cacheBytes: 0,
        cacheNames: [],
      };
    }
    const allNames = await caches.keys();
    const userId = userScope();
    const names = allNames.filter((name) => {
      if (name.startsWith(CACHE_PREFIX) && !name.includes("shell")) {
        if (!userId) return !isPrivateCache(name);
        return isPrivateCache(name) && name.includes(`private:${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}:`);
      }
      return false;
    });
    const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
    return {
      usageBytes: estimate?.usage ?? 0,
      quotaBytes: estimate?.quota ?? 0,
      cacheBytes: await cacheBytes(names),
      cacheNames: names,
    };
  },

  async clearRuntime() {
    if (typeof caches === "undefined") return 0;
    const allNames = await caches.keys();
    const userId = userScope();
    const names = allNames.filter((name) => {
      if (name.startsWith(CACHE_PREFIX) && !name.includes("shell")) {
        if (!userId) return !isPrivateCache(name);
        return isPrivateCache(name) && name.includes(`private:${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}:`);
      }
      return false;
    });
    const results = await Promise.all(names.map((name) => caches.delete(name)));
    return results.filter(Boolean).length;
  },

  async requestPersistentStorage() {
    return navigator.storage?.persist?.() ?? false;
  },
};


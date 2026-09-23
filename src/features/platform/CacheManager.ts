import type { PlatformCacheReport } from "./types";

const CACHE_PREFIX = "studyai-";

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
    const names = typeof caches === "undefined" ? [] : (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX));
    const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
    return {
      usageBytes: estimate?.usage ?? 0,
      quotaBytes: estimate?.quota ?? 0,
      cacheBytes: typeof caches === "undefined" ? 0 : await cacheBytes(names),
      cacheNames: names,
    };
  },

  async clearRuntime() {
    if (typeof caches === "undefined") return 0;
    const names = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX) && !name.includes("shell"));
    const results = await Promise.all(names.map((name) => caches.delete(name)));
    return results.filter(Boolean).length;
  },

  async requestPersistentStorage() {
    return navigator.storage?.persist?.() ?? false;
  },
};


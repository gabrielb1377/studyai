import { createHash } from "node:crypto";
import type { AIManagerRequest, AIResponse } from "./AIProvider";

const MAX_ENTRIES = 100;
const TTL_MS = 30 * 60 * 1_000;

type CacheEntry = { response: AIResponse; createdAt: number };
const runtime = globalThis as typeof globalThis & { __studyAICache?: Map<string, CacheEntry> };
const cache = runtime.__studyAICache ?? new Map<string, CacheEntry>();
runtime.__studyAICache = cache;

function keyFor(request: AIManagerRequest, provider: string, model?: string) {
  return createHash("sha256").update(JSON.stringify({
    provider,
    model,
    history: request.history,
    message: request.message,
  })).digest("hex");
}

export const AIResponseCache = {
  keyFor,
  get(key: string) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > TTL_MS) {
      cache.delete(key);
      return null;
    }
    cache.delete(key);
    cache.set(key, entry);
    return entry.response;
  },
  set(key: string, response: AIResponse) {
    cache.set(key, { response, createdAt: Date.now() });
    while (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next().value as string | undefined;
      if (!oldest) break;
      cache.delete(oldest);
    }
  },
  size() {
    return cache.size;
  },
};

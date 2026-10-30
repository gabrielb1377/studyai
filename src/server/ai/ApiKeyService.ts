import "server-only";

import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { decryptSecret, encryptSecret } from "@/server/security/Crypto";
import { rateLimitStrict } from "@/server/security/RateLimit";
import type { AIProviderId } from "@/features/ai/AIProvider";
import { isAIProviderId } from "@/features/ai/AIProvider";

export type ApiKeyRecord = {
  provider: AIProviderId;
  keyHint: string;
  createdAt: string;
  updatedAt: string;
};

function maskKey(key: string) {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

function validateKey(provider: AIProviderId, key: string) {
  const trimmed = key.trim();
  if (trimmed.length < 8) throw new Error("Chave de API muito curta.");
  if (trimmed.length > 512) throw new Error("Chave de API muito longa.");
  if (/\s/.test(trimmed)) throw new Error("Chave de API não pode conter espaços.");
  // Provider-specific light validation.
  if (provider === "gemini" && !trimmed.startsWith("AIza")) throw new Error("Chave do Gemini inválida.");
  if (provider === "groq" && !trimmed.startsWith("gsk_")) throw new Error("Chave do Groq inválida.");
  if (provider === "openrouter" && !trimmed.startsWith("sk-or-")) throw new Error("Chave do OpenRouter inválida.");
  return trimmed;
}

export const ApiKeyService = {
  async list(userId: string): Promise<ApiKeyRecord[]> {
    const rows = await CloudDatabase.apiKeys(userId);
    return rows
      .filter((row) => isAIProviderId(row.provider))
      .map((row) => ({
        provider: row.provider as AIProviderId,
        keyHint: row.keyHint,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
  },

  async has(userId: string, provider: AIProviderId) {
    const row = await CloudDatabase.apiKey(userId, provider);
    return Boolean(row);
  },

  async getDecrypted(userId: string, provider: AIProviderId): Promise<string | undefined> {
    const row = await CloudDatabase.apiKey(userId, provider);
    if (!row) return undefined;
    try {
      return await decryptSecret(row.encryptedKey);
    } catch {
      return undefined;
    }
  },

  async set(userId: string, provider: AIProviderId, rawKey: string) {
    const key = validateKey(provider, rawKey);
    const encrypted = await encryptSecret(key);
    await CloudDatabase.saveApiKey(userId, provider, encrypted, maskKey(key));
  },

  async delete(userId: string, provider: AIProviderId) {
    await CloudDatabase.deleteApiKey(userId, provider);
  },

  async resolveForUser(userId: string | undefined, provider: AIProviderId): Promise<string | undefined> {
    if (!userId) return process.env[`${provider.toUpperCase()}_API_KEY`]?.trim() || undefined;
    const userKey = await this.getDecrypted(userId, provider);
    if (userKey) return userKey;
    // Fall back to server env only in development or when explicitly allowed.
    return process.env[`${provider.toUpperCase()}_API_KEY`]?.trim() || undefined;
  },

  async rateLimitSet(userId: string) {
    return rateLimitStrict(`apikey:set:${userId}`, 10, 60_000);
  },

  async rateLimitTest(userId: string) {
    return rateLimitStrict(`apikey:test:${userId}`, 10, 60_000);
  },
};
import { NextResponse } from "next/server";
import { requireActiveSession, requireUser } from "@/server/auth/http";
import { QuotaService } from "@/server/ai/QuotaService";
import { ApiKeyService } from "@/server/ai/ApiKeyService";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { aiProviderIds, type AIProviderId } from "@/features/ai/AIProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVACY_HEADERS = {
  "Cache-Control": "no-store, private, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie, Authorization",
};

export async function GET(request: Request) {
  try {
    // Identidade derivada exclusivamente da sessão autenticada no servidor.
    // Qualquer query param (ex.: ?userId=...) é estritamente ignorado.
    const user = requireUser(request);
    await requireActiveSession(request, user);
    const userId = user.sub;

    const [quotaInfo, emailVerified, sharedAvailable, usageStats, storage, accounting] = await Promise.all([
      QuotaService.getQuotaInfo(userId),
      QuotaService.isEmailVerified(userId),
      QuotaService.isSharedAIAvailable(),
      QuotaService.getUsageStats(userId, 30),
      CloudDatabase.storageUsage(userId),
      QuotaService.getUsageBreakdown(userId),
    ]);

    // Apenas identifica quais provedores possuem chave BYOK salva (nunca retorna segredos).
    const byokProviders: AIProviderId[] = [];
    for (const provider of aiProviderIds) {
      if (provider === "ollama") continue;
      const key = await ApiKeyService.getDecrypted(userId, provider);
      if (key) byokProviders.push(provider);
    }

    const hasAnyBYOK = byokProviders.length > 0;
    const mode = hasAnyBYOK ? "byok" : "shared";

    const dailyUsagePercent = quotaInfo.daily.limit > 0
      ? Math.min(100, Math.max(0, Math.round((quotaInfo.daily.used / quotaInfo.daily.limit) * 100)))
      : 0;
    const minuteUsagePercent = quotaInfo.minute.limit > 0
      ? Math.min(100, Math.max(0, Math.round((quotaInfo.minute.used / quotaInfo.minute.limit) * 100)))
      : 0;
    const tokenUsed = Math.max(0, quotaInfo.tokens?.used ?? 0);
    const tokenReserved = Math.max(0, quotaInfo.tokens?.reserved ?? 0);
    const tokenLimit = Math.max(0, quotaInfo.tokens?.limit ?? 0);
    const tokenUsagePercent = tokenLimit > 0
      ? Math.min(100, Math.max(0, Math.round(((tokenUsed + tokenReserved) / tokenLimit) * 100)))
      : 0;

    let warning: "none" | "approaching" | "critical" = "none";
    if (dailyUsagePercent >= 90 || minuteUsagePercent >= 90 || tokenUsagePercent >= 90) {
      warning = "critical";
    } else if (dailyUsagePercent >= 75 || minuteUsagePercent >= 75 || tokenUsagePercent >= 75) {
      warning = "approaching";
    }

    // Não expõe números internos do orçamento global — apenas disponibilidade booleana
    // e métricas estritamente pertencentes à conta autenticada.
    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      mode,
      emailVerified,
      sharedAvailable,
      byokProviders,
      daily: {
        used: Math.max(0, quotaInfo.daily.used),
        limit: Math.max(0, quotaInfo.daily.limit),
        remaining: Math.max(0, quotaInfo.daily.remaining),
        percent: dailyUsagePercent,
        resetAt: quotaInfo.daily.resetAt,
      },
      minute: {
        used: Math.max(0, quotaInfo.minute.used),
        limit: Math.max(0, quotaInfo.minute.limit),
        remaining: Math.max(0, quotaInfo.minute.remaining),
        percent: minuteUsagePercent,
        resetAt: quotaInfo.minute.resetAt,
      },
      tokens: quotaInfo.tokens
        ? {
            used: tokenUsed,
            reserved: tokenReserved,
            limit: tokenLimit,
            remaining: Math.max(0, quotaInfo.tokens.remaining),
            percent: tokenUsagePercent,
            resetAt: quotaInfo.tokens.resetAt,
          }
        : undefined,
      accounting,
      availability: {
        blockedRequestsTracked: false,
        cacheHitsTracked: false,
        externalProviderLimitsTracked: false,
        monetaryCostTracked: false,
      },
      storage,
      warning,
      usageStats,
      hasAnyBYOK,
    }, {
      headers: PRIVACY_HEADERS,
    });
  } catch (error) {
    const { apiError } = await import("@/server/auth/http");
    const response = apiError(error);
    for (const [key, value] of Object.entries(PRIVACY_HEADERS)) {
      response.headers.set(key, value);
    }
    return response;
  }
}

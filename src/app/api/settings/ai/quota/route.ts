import { NextResponse } from "next/server";
import { requireActiveSession, requireUser } from "@/server/auth/http";
import { QuotaService } from "@/server/ai/QuotaService";
import { ApiKeyService } from "@/server/ai/ApiKeyService";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { aiProviderIds } from "@/features/ai/AIProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    await requireActiveSession(request, user);
    const userId = user.sub;

    const [quotaInfo, emailVerified, sharedAvailable, usageStats, storage] = await Promise.all([
      QuotaService.getQuotaInfo(userId),
      QuotaService.isEmailVerified(userId),
      QuotaService.isSharedAIAvailable(),
      QuotaService.getUsageStats(userId, 30),
      CloudDatabase.storageUsage(userId),
    ]);

    const userApiKeys: Record<string, string> = {};
    for (const provider of aiProviderIds) {
      const key = await ApiKeyService.getDecrypted(userId, provider);
      if (key) userApiKeys[provider] = key;
    }

    const hasAnyBYOK = Object.keys(userApiKeys).length > 0;
    const mode = hasAnyBYOK ? "byok" : "shared";

    const dailyUsagePercent = quotaInfo.daily.limit > 0
      ? Math.round((quotaInfo.daily.used / quotaInfo.daily.limit) * 100)
      : 0;
    const minuteUsagePercent = quotaInfo.minute.limit > 0
      ? Math.round((quotaInfo.minute.used / quotaInfo.minute.limit) * 100)
      : 0;
    const tokenUsed = quotaInfo.tokens?.used ?? 0;
    const tokenReserved = quotaInfo.tokens?.reserved ?? 0;
    const tokenLimit = quotaInfo.tokens?.limit ?? 0;
    const tokenUsagePercent = tokenLimit > 0
      ? Math.min(100, Math.round(((tokenUsed + tokenReserved) / tokenLimit) * 100))
      : 0;

    let warning: "none" | "approaching" | "critical" = "none";
    if (dailyUsagePercent >= 90 || minuteUsagePercent >= 90 || tokenUsagePercent >= 90) {
      warning = "critical";
    } else if (dailyUsagePercent >= 75 || minuteUsagePercent >= 75 || tokenUsagePercent >= 75) {
      warning = "approaching";
    }

    const dailyReset = new Date();
    dailyReset.setHours(24, 0, 0, 0);
    const minuteReset = new Date(Math.ceil(Date.now() / 60_000) * 60_000);

    // Não expõe números internos do orçamento global — apenas estado booleano de disponibilidade.
    return NextResponse.json({
      mode,
      emailVerified,
      sharedAvailable,
      daily: {
        used: quotaInfo.daily.used,
        limit: quotaInfo.daily.limit,
        remaining: quotaInfo.daily.remaining,
        percent: dailyUsagePercent,
        resetAt: dailyReset.toISOString(),
      },
      minute: {
        used: quotaInfo.minute.used,
        limit: quotaInfo.minute.limit,
        remaining: quotaInfo.minute.remaining,
        percent: minuteUsagePercent,
        resetAt: minuteReset.toISOString(),
      },
      tokens: quotaInfo.tokens
        ? {
            used: quotaInfo.tokens.used,
            reserved: quotaInfo.tokens.reserved,
            limit: quotaInfo.tokens.limit,
            remaining: quotaInfo.tokens.remaining,
            percent: tokenUsagePercent,
            resetAt: quotaInfo.tokens.resetAt,
          }
        : undefined,
      storage,
      warning,
      usageStats,
      hasAnyBYOK,
    }, {
      headers: {
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    const { apiError } = await import("@/server/auth/http");
    return apiError(error);
  }
}

import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/http";
import { QuotaService } from "@/server/ai/QuotaService";
import { ApiKeyService } from "@/server/ai/ApiKeyService";
import { aiProviderIds } from "@/features/ai/AIProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    const userId = user.sub;

    // Get quota info from QuotaService
    const quotaInfo = await QuotaService.getQuotaInfo(userId);

    // Check user's BYOK keys to determine mode
    const userApiKeys: Record<string, string> = {};
    for (const provider of aiProviderIds) {
      const key = await ApiKeyService.getDecrypted(userId, provider);
      if (key) userApiKeys[provider] = key;
    }

    const hasAnyBYOK = Object.keys(userApiKeys).length > 0;
    const mode = hasAnyBYOK ? "byok" : "shared";

    // Get usage stats for the last 30 days
    const usageStats = await QuotaService.getUsageStats(userId, 30);

    // Calculate daily usage percentage
    const dailyUsagePercent = quotaInfo.daily.limit > 0
      ? Math.round((quotaInfo.daily.used / quotaInfo.daily.limit) * 100)
      : 0;

    // Calculate minute usage percentage
    const minuteUsagePercent = quotaInfo.minute.limit > 0
      ? Math.round((quotaInfo.minute.used / quotaInfo.minute.limit) * 100)
      : 0;

    // Determine warning status
    let warning: "none" | "approaching" | "critical" = "none";
    if (dailyUsagePercent >= 90 || minuteUsagePercent >= 90) {
      warning = "critical";
    } else if (dailyUsagePercent >= 75 || minuteUsagePercent >= 75) {
      warning = "approaching";
    }

    // Get next reset times
    const dailyReset = new Date();
    dailyReset.setHours(24, 0, 0, 0);
    const minuteReset = new Date(Math.ceil(Date.now() / 60_000) * 60_000);

    return NextResponse.json({
      mode,
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
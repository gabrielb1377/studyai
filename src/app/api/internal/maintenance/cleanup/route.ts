import { NextResponse } from "next/server";
import { jsonBody } from "@/server/auth/http";
import { OperationalCleanup } from "@/server/database/OperationalCleanup";
import { constantTimeEqual } from "@/server/security/Crypto";
import { rateLimitStrict, requestAddress } from "@/server/security/RateLimit";

export const dynamic = "force-dynamic";

const MIN_SECRET_LENGTH = 32;
const MAX_BODY_BYTES = 4 * 1024;
const NO_STORE_HEADERS = { "cache-control": "no-store" };

function extractPresentedSecret(request: Request): string {
  const direct = request.headers.get("x-maintenance-secret")?.trim();
  if (direct) return direct;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (/^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim();
  }
  return "";
}

function parseOptionalInt(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const truncated = Math.trunc(value);
  return Math.min(max, Math.max(min, truncated));
}

export async function POST(request: Request) {
  const configuredSecret = process.env.MAINTENANCE_SECRET?.trim() ?? "";
  if (configuredSecret.length < MIN_SECRET_LENGTH) {
    return NextResponse.json(
      { error: "Manutenção operacional não configurada." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const limit = await rateLimitStrict(`internal:cleanup:${requestAddress(request)}`, 10, 60_000);
  if (limit.unavailable) {
    return NextResponse.json(
      { error: "Serviço temporariamente indisponível." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Limite de execuções de manutenção atingido." },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          ...(limit.retryAfter ? { "retry-after": String(limit.retryAfter) } : {}),
        },
      },
    );
  }

  const presented = extractPresentedSecret(request);
  if (!presented || !constantTimeEqual(presented, configuredSecret)) {
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  let body: Record<string, unknown> = {};
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  const contentType = request.headers.get("content-type") ?? "";
  if (contentLength > 0 || contentType.includes("application/json")) {
    try {
      const parsed = await jsonBody<unknown>(request, MAX_BODY_BYTES);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      } else {
        return NextResponse.json(
          { error: "Corpo de manutenção inválido." },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }
    } catch (error) {
      if (error instanceof Response) {
        return new NextResponse(error.body, {
          status: error.status,
          headers: { "content-type": "application/json", ...NO_STORE_HEADERS },
        });
      }
      return NextResponse.json(
        { error: "Corpo de manutenção inválido." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
  }

  try {
    const result = await OperationalCleanup.run({
      rateLimitMaxAgeMs: parseOptionalInt(body.rateLimitMaxAgeMs, 1, 365 * 24 * 60 * 60 * 1000),
      quotaMinuteRetainDays: parseOptionalInt(body.quotaMinuteRetainDays, 2, 365),
      batchLimit: parseOptionalInt(body.batchLimit, 100, 50_000),
    });

    if (!result.executed && result.skippedReason === "already_running") {
      return NextResponse.json(
        { ok: true, ...result },
        { status: 202, headers: NO_STORE_HEADERS },
      );
    }
    if (!result.executed && result.skippedReason === "postgres_unavailable") {
      return NextResponse.json(
        { ok: false, ...result },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: true, ...result },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
    console.error("[OperationalCleanup] Route failure", {
      code,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      { error: "Falha ao executar limpeza operacional." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}

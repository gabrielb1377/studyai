import { NextResponse } from "next/server";
import { AuthService } from "@/server/auth/AuthService";
import { apiError, jsonBody } from "@/server/auth/http";
import { hashToken } from "@/server/security/Crypto";
import { rateLimitStrict, requestAddress } from "@/server/security/RateLimit";
import { rateLimitRejection } from "@/server/security/RateLimitHttp";

export async function POST(request: Request) {
  try {
    const body = await jsonBody<{ token?: unknown }>(request, 4096);
    if (typeof body.token !== "string" || !body.token.trim()) {
      return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 400 });
    }
    const ipLimit = await rateLimitStrict(`verify:${requestAddress(request)}`, 10, 15 * 60_000);
    if (!ipLimit.allowed) {
      return rateLimitRejection(ipLimit, "Muitas tentativas. Aguarde antes de tentar novamente.");
    }
    const tokenLimit = await rateLimitStrict(
      `verify-token:${hashToken(body.token).slice(0, 16)}`,
      5,
      15 * 60_000,
    );
    if (!tokenLimit.allowed) {
      return rateLimitRejection(tokenLimit, "Muitas tentativas. Aguarde antes de tentar novamente.");
    }
    await AuthService.verifyEmail(body.token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

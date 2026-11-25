import { NextResponse } from "next/server";
import { AuthService } from "@/server/auth/AuthService";
import { apiError, jsonBody, setAuthCookies } from "@/server/auth/http";
import { rateLimitStrict, requestAddress } from "@/server/security/RateLimit";
import { rateLimitRejection } from "@/server/security/RateLimitHttp";

export async function POST(request: Request) {
  try {
    const limit = await rateLimitStrict(`login:${requestAddress(request)}`, 10, 15 * 60_000);
    if (!limit.allowed) return rateLimitRejection(limit, "Muitas tentativas. Aguarde antes de tentar novamente.");
    const input = await jsonBody<{ email: string; password: string; rememberDevice?: boolean; deviceId: string; deviceName: string }>(request);
    const result = await AuthService.login(input); const response = NextResponse.json({ ok: true, expiresIn: result.expiresIn }); setAuthCookies(response, result); return response;
  } catch (error) { return apiError(error); }
}


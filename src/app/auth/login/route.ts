import { NextResponse } from "next/server";
import { AuthService } from "@/server/auth/AuthService";
import { apiError, jsonBody, setAuthCookies } from "@/server/auth/http";
import { rateLimit, requestAddress } from "@/server/security/RateLimit";

export async function POST(request: Request) {
  try {
    if (!rateLimit(`login:${requestAddress(request)}`, 10, 15 * 60_000).allowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde antes de tentar novamente." }, { status: 429 });
    const input = await jsonBody<{ email: string; password: string; deviceId: string; deviceName: string }>(request);
    const result = await AuthService.login(input); const response = NextResponse.json({ ok: true, expiresIn: result.expiresIn }); setAuthCookies(response, result); return response;
  } catch (error) { return apiError(error); }
}


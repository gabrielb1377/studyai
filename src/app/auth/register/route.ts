import { NextResponse } from "next/server";
import { AuthService } from "@/server/auth/AuthService";
import { apiError, jsonBody, setAuthCookies } from "@/server/auth/http";
import { rateLimit, requestAddress } from "@/server/security/RateLimit";
import { EmailService } from "@/server/auth/EmailService";

export async function POST(request: Request) {
  try {
    if (!rateLimit(`register:${requestAddress(request)}`, 5, 15 * 60_000).allowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde antes de tentar novamente." }, { status: 429 });
    EmailService.requireConfiguration();
    const input = await jsonBody<{ name: string; email: string; password: string; deviceId: string; deviceName: string }>(request);
    const result = await AuthService.register(input);
    await EmailService.sendVerification(input.email, result.verificationToken, new URL(request.url).origin);
    const response = NextResponse.json({ ok: true, verificationToken: process.env.NODE_ENV === "production" ? undefined : result.verificationToken, database: process.env.DATABASE_URL ? "postgres" : "development-memory" }, { status: 201 });
    setAuthCookies(response, result); return response;
  } catch (error) { return apiError(error); }
}

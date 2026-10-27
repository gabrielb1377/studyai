import { NextResponse } from "next/server";
import { AuthService } from "@/server/auth/AuthService";
import { apiError, jsonBody, publicOrigin } from "@/server/auth/http";
import { rateLimitStrict, requestAddress } from "@/server/security/RateLimit";
import { rateLimitRejection } from "@/server/security/RateLimitHttp";
import { EmailService } from "@/server/auth/EmailService";

export async function POST(request: Request) { try { const limit = await rateLimitStrict(`recover:${requestAddress(request)}`, 5, 15 * 60_000); if (!limit.allowed) return rateLimitRejection(limit, "Aguarde antes de solicitar novamente."); const { email } = await jsonBody<{ email: string }>(request); const result = await AuthService.requestRecovery(email); if(result.recoveryToken&&result.email)await EmailService.sendRecovery(result.email,result.recoveryToken,publicOrigin(request)); return NextResponse.json({ ok: true, message: "Se o email existir, as instruções foram geradas.", recoveryToken: process.env.NODE_ENV === "production" ? undefined : result.recoveryToken }); } catch (error) { return apiError(error); } }

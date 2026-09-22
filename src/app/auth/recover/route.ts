import { NextResponse } from "next/server";
import { AuthService } from "@/server/auth/AuthService";
import { apiError, jsonBody } from "@/server/auth/http";
import { rateLimit, requestAddress } from "@/server/security/RateLimit";
import { EmailService } from "@/server/auth/EmailService";

export async function POST(request: Request) { try { if (!rateLimit(`recover:${requestAddress(request)}`, 5, 15 * 60_000).allowed) return NextResponse.json({ error: "Aguarde antes de solicitar novamente." }, { status: 429 }); const { email } = await jsonBody<{ email: string }>(request); const result = await AuthService.requestRecovery(email); if(result.recoveryToken&&result.email)await EmailService.sendRecovery(result.email,result.recoveryToken,new URL(request.url).origin); return NextResponse.json({ ok: true, message: "Se o email existir, as instruções foram geradas.", recoveryToken: process.env.NODE_ENV === "production" ? undefined : result.recoveryToken }); } catch (error) { return apiError(error); } }

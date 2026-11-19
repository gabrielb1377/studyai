import { NextResponse } from "next/server";
import { AuthService } from "@/server/auth/AuthService";
import { EmailService } from "@/server/auth/EmailService";
import {
  apiError,
  jsonBody,
  publicOrigin,
  requireActiveSession,
  requireCsrf,
  requireUser,
} from "@/server/auth/http";
import { rateLimitStrict } from "@/server/security/RateLimit";
import { rateLimitRejection } from "@/server/security/RateLimitHttp";

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    EmailService.requireConfiguration();
    const user = requireUser(request);
    await requireActiveSession(request, user);
    const body = await jsonBody<{ password?: unknown; email?: unknown }>(request, 4096);
    if (
      typeof body.password !== "string" ||
      !body.password ||
      typeof body.email !== "string" ||
      !body.email.trim()
    ) {
      return NextResponse.json({ error: "Informe sua senha e o novo email." }, { status: 400 });
    }
    const limit = await rateLimitStrict(`change-email:${user.sub}`, 5, 15 * 60_000);
    if (!limit.allowed) {
      return rateLimitRejection(limit, "Muitas tentativas. Aguarde antes de tentar novamente.");
    }
    const result = await AuthService.changeEmail(user.sub, body.password, body.email);
    await EmailService.sendVerification(result.email, result.verificationToken, publicOrigin(request));
    return NextResponse.json({
      ok: true,
      verificationToken: process.env.NODE_ENV === "production" ? undefined : result.verificationToken,
    });
  } catch (error) {
    return apiError(error);
  }
}

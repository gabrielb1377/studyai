import { NextResponse } from "next/server";
import { AuthService } from "@/server/auth/AuthService";
import { EmailService } from "@/server/auth/EmailService";
import { apiError, publicOrigin, requireActiveSession, requireCsrf, requireUser } from "@/server/auth/http";
import { rateLimitStrict, requestAddress } from "@/server/security/RateLimit";
import { rateLimitRejection } from "@/server/security/RateLimitHttp";

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);

    const ipLimit = await rateLimitStrict(`verify-resend:${requestAddress(request)}`, 5, 15 * 60_000);
    if (!ipLimit.allowed) {
      return rateLimitRejection(ipLimit, "Aguarde antes de reenviar o email de verificação.");
    }
    const userLimit = await rateLimitStrict(`verify-resend-user:${user.sub}`, 3, 15 * 60_000);
    if (!userLimit.allowed) {
      return rateLimitRejection(userLimit, "Aguarde antes de reenviar o email de verificação.");
    }

    EmailService.requireConfiguration();
    const result = await AuthService.resendVerification(user.sub);
    if (result.alreadyVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true });
    }
    await EmailService.sendVerification(result.email, result.verificationToken, publicOrigin(request));
    return NextResponse.json({
      ok: true,
      alreadyVerified: false,
      verificationToken: process.env.NODE_ENV === "production" ? undefined : result.verificationToken,
    });
  } catch (error) {
    return apiError(error);
  }
}

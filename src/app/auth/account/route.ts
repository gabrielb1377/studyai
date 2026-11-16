import { NextResponse } from "next/server";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import {
  apiError,
  clearAuthCookies,
  jsonBody,
  requireActiveSession,
  requireCsrf,
  requireUser,
} from "@/server/auth/http";
import { rateLimitStrict } from "@/server/security/RateLimit";
import { rateLimitRejection } from "@/server/security/RateLimitHttp";

export async function DELETE(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);
    const body = await jsonBody<{ confirmation?: unknown }>(request, 4096);
    const limit = await rateLimitStrict(`delete-account:${user.sub}`, 5, 15 * 60_000);
    if (!limit.allowed) {
      return rateLimitRejection(limit, "Muitas tentativas. Aguarde antes de tentar novamente.");
    }
    if (body.confirmation !== "EXCLUIR") {
      return NextResponse.json({ error: "Confirmação inválida." }, { status: 400 });
    }
    await CloudDatabase.deleteAccount(user.sub);
    const response = NextResponse.json({ ok: true });
    clearAuthCookies(response);
    return response;
  } catch (error) {
    return apiError(error);
  }
}

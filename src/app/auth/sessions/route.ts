import { NextResponse } from "next/server";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { apiError, clearAuthCookies, requireActiveSession, requireCsrf, requireUser } from "@/server/auth/http";

export async function DELETE(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);
    await CloudDatabase.revokeUserSessions(user.sub);
    const response = NextResponse.json({ ok: true });
    clearAuthCookies(response);
    return response;
  } catch (error) {
    return apiError(error);
  }
}

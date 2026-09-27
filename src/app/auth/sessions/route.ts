import { NextResponse } from "next/server";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { apiError, clearAuthCookies, requireCsrf, requireUser } from "@/server/auth/http";

export async function DELETE(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await CloudDatabase.revokeUserSessions(user.sub);
    const response = NextResponse.json({ ok: true });
    clearAuthCookies(response);
    return response;
  } catch (error) { return apiError(error); }
}

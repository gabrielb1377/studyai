import { NextResponse } from "next/server";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { apiError, clearAuthCookies, jsonBody, requireCsrf, requireUser } from "@/server/auth/http";

export async function DELETE(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    const body = await jsonBody<{ confirmation?: string }>(request);
    if (body.confirmation !== "EXCLUIR") return NextResponse.json({ error: "Confirmação inválida." }, { status: 400 });
    await CloudDatabase.deleteAccount(user.sub);
    const response = NextResponse.json({ ok: true });
    clearAuthCookies(response);
    return response;
  } catch (error) { return apiError(error); }
}

import { NextResponse } from "next/server";
import { apiError, requireCsrf, requireUser } from "@/server/auth/http";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    const { id } = await params;
    if (id === user.sessionId) return NextResponse.json({ error: "Use Sair para encerrar este dispositivo." }, { status: 400 });
    await CloudDatabase.revokeUserSession(user.sub, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

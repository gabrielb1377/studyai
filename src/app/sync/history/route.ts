import { NextResponse } from "next/server";
import { apiError, requireActiveSession, requireUser } from "@/server/auth/http";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    await requireActiveSession(request, user);
    return NextResponse.json({ history: await CloudDatabase.history(user.sub) });
  } catch (error) {
    return apiError(error);
  }
}

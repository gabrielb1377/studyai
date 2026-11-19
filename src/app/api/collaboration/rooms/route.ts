import { NextResponse } from "next/server";
import { jsonBody, requireActiveSession, requireCsrf, requireUser } from "@/server/auth/http";
import { CollaborationService } from "@/server/collaboration/CollaborationService";
import { collaborationError, collaborationRateLimit } from "@/server/collaboration/http";

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    await requireActiveSession(request, user);
    return NextResponse.json({ rooms: await CollaborationService.listRooms(user.sub) });
  } catch (error) {
    return collaborationError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);
    await collaborationRateLimit(user.sub);
    const body = await jsonBody<{ name?: unknown; description?: unknown; kind?: unknown }>(request, 16 * 1024);
    const room = await CollaborationService.createRoom(user.sub, body);
    return NextResponse.json({ room }, { status: 201 });
  } catch (error) {
    return collaborationError(error);
  }
}

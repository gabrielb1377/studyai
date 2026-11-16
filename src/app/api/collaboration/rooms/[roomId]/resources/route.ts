import { NextResponse } from "next/server";
import { jsonBody, requireActiveSession, requireCsrf, requireUser } from "@/server/auth/http";
import { CollaborationService } from "@/server/collaboration/CollaborationService";
import { collaborationError, collaborationRateLimit } from "@/server/collaboration/http";

type Context = { params: Promise<{ roomId: string }> };

const MAX_RESOURCE_BODY_BYTES = 256 * 1024;
const MAX_RESOURCE_DELETE_BYTES = 8 * 1024;

function assertPlainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Response(JSON.stringify({ error: "Payload inválido." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  return value as Record<string, unknown>;
}

export async function POST(request: Request, { params }: Context) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);
    await collaborationRateLimit(user.sub);
    const { roomId } = await params;
    const body = assertPlainObject(await jsonBody<unknown>(request, MAX_RESOURCE_BODY_BYTES));
    return NextResponse.json({ resource: await CollaborationService.saveResource(roomId, user.sub, body) }, { status: 201 });
  } catch (error) {
    return collaborationError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);
    await collaborationRateLimit(user.sub);
    const { roomId } = await params;
    const body = assertPlainObject(await jsonBody<unknown>(request, MAX_RESOURCE_BODY_BYTES));
    return NextResponse.json({ resource: await CollaborationService.saveResource(roomId, user.sub, body) });
  } catch (error) {
    return collaborationError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);
    await collaborationRateLimit(user.sub);
    const { roomId } = await params;
    const body = assertPlainObject(await jsonBody<unknown>(request, MAX_RESOURCE_DELETE_BYTES));
    await CollaborationService.removeResource(roomId, user.sub, body.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return collaborationError(error);
  }
}

import { NextResponse } from "next/server";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { apiError, jsonBody, publicOrigin, requireActiveSession, requireCsrf, requireUser } from "@/server/auth/http";
import { syncEntities, type SyncEntity } from "@/server/cloud/types";
import { rateLimit, requestAddress } from "@/server/security/RateLimit";

const SHARE_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{16,128}$/;

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (token !== null) {
      const limit = await rateLimit(`share-read:${requestAddress(request)}`, 60, 60_000);
      if (!limit.allowed) {
        return NextResponse.json({ error: "Muitas consultas. Tente novamente em instantes." }, { status: 429 });
      }
      if (!SHARE_TOKEN_PATTERN.test(token)) {
        return NextResponse.json({ error: "Compartilhamento não encontrado." }, { status: 404 });
      }
      const shared = await CloudDatabase.shareByToken(token);
      if (!shared) {
        return NextResponse.json({ error: "Compartilhamento não encontrado." }, { status: 404 });
      }
      if (shared.share.visibility === "private") {
        const user = requireUser(request);
        await requireActiveSession(request, user);
        if (shared.share.userId !== user.sub) {
          return NextResponse.json({ error: "Acesso negado a este compartilhamento privado." }, { status: 403 });
        }
      }
      return NextResponse.json({
        ...shared,
        share: {
          ...shared.share,
          accessLevel: "read" as const,
        },
      });
    }
    const user = requireUser(request);
    await requireActiveSession(request, user);
    const limit = await rateLimit(`share-list:${user.sub}`, 60, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Muitas consultas. Tente novamente em instantes." }, { status: 429 });
    }
    return NextResponse.json({ shares: await CloudDatabase.shares(user.sub) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);
    const limit = await rateLimit(`share-write:${user.sub}`, 30, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Limite de compartilhamentos atingido. Tente novamente em instantes." }, { status: 429 });
    }
    const body = await jsonBody<{
      entity?: unknown;
      recordId?: unknown;
      expiresAt?: unknown;
      visibility?: unknown;
      accessLevel?: unknown;
    }>(request, 8 * 1024);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Solicitação de compartilhamento inválida." }, { status: 400 });
    }
    if (typeof body.entity !== "string" || !syncEntities.includes(body.entity as SyncEntity)) {
      return NextResponse.json({ error: "Tipo não suportado." }, { status: 400 });
    }
    if (typeof body.recordId !== "string" || !body.recordId.trim() || body.recordId.length > 300) {
      return NextResponse.json({ error: "Identificador de registro inválido." }, { status: 400 });
    }
    let normalizedExpiresAt: string | undefined;
    if (body.expiresAt !== undefined) {
      if (typeof body.expiresAt !== "string" || !Number.isFinite(Date.parse(body.expiresAt)) || Date.parse(body.expiresAt) <= Date.now()) {
        return NextResponse.json({ error: "Data de expiração inválida." }, { status: 400 });
      }
      normalizedExpiresAt = new Date(body.expiresAt).toISOString();
    }
    if (body.visibility !== undefined && body.visibility !== "public" && body.visibility !== "private") {
      return NextResponse.json({ error: "Visibilidade inválida." }, { status: 400 });
    }
    if (body.accessLevel !== undefined && body.accessLevel !== "read") {
      return NextResponse.json({ error: "Links compartilhados suportam apenas permissão de leitura." }, { status: 400 });
    }
    const entity = body.entity as SyncEntity;
    const recordId = body.recordId.trim();
    const record = await CloudDatabase.record(user.sub, entity, recordId);
    if (!record) {
      return NextResponse.json({ error: "Registro não encontrado na nuvem." }, { status: 404 });
    }
    const visibility = body.visibility === "private" ? "private" : "public";
    const share = await CloudDatabase.createShare(
      user.sub,
      entity,
      recordId,
      normalizedExpiresAt,
      visibility,
      "read",
    );
    return NextResponse.json({ share, url: `${publicOrigin(request)}/compartilhar/${share.token}` }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);
    const limit = await rateLimit(`share-write:${user.sub}`, 30, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Muitas tentativas. Tente novamente em instantes." }, { status: 429 });
    }
    const body = await jsonBody<{ id?: unknown }>(request, 4096);
    if (!body || typeof body.id !== "string" || !body.id.trim() || body.id.length > 200) {
      return NextResponse.json({ error: "Identificador do compartilhamento inválido." }, { status: 400 });
    }
    await CloudDatabase.revokeShare(user.sub, body.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

import { NextResponse } from "next/server";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { apiError, requireActiveSession, requireCsrf, requireSessionOwner, requireUser } from "@/server/auth/http";
import { secureHash } from "@/server/security/Crypto";
import { rateLimit } from "@/server/security/RateLimit";
import {
  buildDownloadHeaders,
  MAX_FILE_BYTES,
  parseUploadFileName,
  validateFileId,
  validateFileUpload,
} from "@/server/storage/FileSecurity";

async function readBoundedBuffer(request: Request, maxBytes: number): Promise<Buffer> {
  if (!request.body) {
    const content = Buffer.from(await request.arrayBuffer());
    if (content.byteLength > maxBytes) {
      throw new Response(JSON.stringify({ code: "FILE_TOO_LARGE", error: "Arquivo maior que 100 MB." }), {
        status: 413,
        headers: { "content-type": "application/json" },
      });
    }
    return content;
  }
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Response(JSON.stringify({ code: "FILE_TOO_LARGE", error: "Arquivo maior que 100 MB." }), {
        status: 413,
        headers: { "content-type": "application/json" },
      });
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);
    requireSessionOwner(request, user.sub);
    const { id: rawId } = await params;
    const id = validateFileId(rawId);
    const fileName = parseUploadFileName(request.headers.get("x-file-name"), id);
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_BYTES) {
      return NextResponse.json({ code: "FILE_TOO_LARGE", error: "Arquivo maior que 100 MB." }, { status: 413 });
    }
    // Nunca confiar em Content-Length forjado: lê o payload real sob teto rígido e usa content.byteLength na cota.
    const content = await readBoundedBuffer(request, MAX_FILE_BYTES);
    const { safeName, safeMime } = validateFileUpload({
      fileName,
      declaredMime: request.headers.get("content-type"),
      content,
    });
    const hash = secureHash(content);
    const expected = request.headers.get("x-file-hash");
    if (expected && expected !== hash) {
      return NextResponse.json({ error: "Hash do arquivo não confere." }, { status: 400 });
    }
    const limit = await rateLimit(`file:${user.sub}`, 30, 60 * 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Limite de uploads temporariamente atingido." }, { status: 429 });
    }
    const file = await CloudDatabase.saveFile(user.sub, id, safeName, safeMime, hash, content);
    return NextResponse.json({ id: file.id, hash: file.hash, size: file.sizeBytes });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(request);
    await requireActiveSession(request, user);
    requireSessionOwner(request, user.sub);
    const { id: rawId } = await params;
    const id = validateFileId(rawId);
    const file = await CloudDatabase.file(user.sub, id);
    if (!file) {
      return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
    }
    const headers = buildDownloadHeaders({
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      hash: file.hash,
      content: file.content,
    });
    return new Response(Uint8Array.from(file.content).buffer, { headers });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireCsrf(request);
    const user = requireUser(request);
    await requireActiveSession(request, user);
    requireSessionOwner(request, user.sub);
    const { id: rawId } = await params;
    const id = validateFileId(rawId);
    await CloudDatabase.deleteFile(user.sub, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

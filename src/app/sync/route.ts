import { NextResponse } from "next/server";
import { apiError, requireCsrf, requireUser } from "@/server/auth/http";
import { SyncService } from "@/server/cloud/SyncService";
import { syncEntities, type SyncMutation } from "@/server/cloud/types";
import { gunzipSync } from "node:zlib";
import { rateLimit } from "@/server/security/RateLimit";

const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;

async function syncBody(request: Request) {
  const input = Buffer.from(await request.arrayBuffer());
  if (input.byteLength > (request.headers.get("content-encoding") === "gzip" ? MAX_COMPRESSED_BYTES : MAX_PAYLOAD_BYTES)) {
    throw new Response(JSON.stringify({ error: "Payload de sincronização muito grande." }), { status: 413, headers: { "content-type": "application/json" } });
  }
  try {
    const output = request.headers.get("content-encoding") === "gzip"
      ? gunzipSync(input, { maxOutputLength: MAX_PAYLOAD_BYTES })
      : input;
    return JSON.parse(output.toString("utf8")) as { mutations: SyncMutation[] };
  } catch {
    throw new Response(JSON.stringify({ error: "Payload de sincronização inválido." }), { status: 400, headers: { "content-type": "application/json" } });
  }
}

function validMutation(item: SyncMutation) {
  return syncEntities.includes(item.entity)
    && typeof item.recordId === "string" && item.recordId.length > 0 && item.recordId.length <= 300
    && (item.operation === "upsert" || item.operation === "delete")
    && Number.isSafeInteger(item.baseVersion) && item.baseVersion >= 0
    && typeof item.hash === "string" && item.hash.length <= 128
    && typeof item.deviceId === "string" && item.deviceId.length > 0 && item.deviceId.length <= 200
    && !Number.isNaN(Date.parse(item.updatedAt));
}

export async function GET(request:Request){try{const user=requireUser(request);const since=Math.max(0,Math.floor(Number(new URL(request.url).searchParams.get("since")??0)));const changes=await SyncService.pull(user.sub,Number.isFinite(since)?since:0);return NextResponse.json({changes,cursor:changes.at(-1)?.sequence??since});}catch(error){return apiError(error);}}
export async function POST(request:Request){try{requireCsrf(request);const user=requireUser(request);if(!rateLimit(`sync:${user.sub}`,120,60_000).allowed)return NextResponse.json({error:"Sincronização temporariamente limitada."},{status:429});const {mutations}=await syncBody(request);if(!Array.isArray(mutations)||mutations.length>2_000||mutations.some((item)=>!validMutation(item)))return NextResponse.json({error:"Mutações inválidas."},{status:400});return NextResponse.json(await SyncService.push(user.sub,mutations));}catch(error){return apiError(error);}}

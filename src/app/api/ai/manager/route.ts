import { NextResponse } from "next/server";

import { AIService } from "@/features/ai/AIService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = await AIService.status({
    force: url.searchParams.get("refresh") === "true",
    signal: request.signal,
  });
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}

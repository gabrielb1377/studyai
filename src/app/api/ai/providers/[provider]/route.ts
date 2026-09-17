import { NextResponse } from "next/server";

import { AIService } from "@/features/ai/AIService";
import { isAIProviderId } from "@/features/ai/AIProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ provider: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { provider } = await params;
  if (!isAIProviderId(provider)) {
    return NextResponse.json({ error: "Provider de IA inválido." }, { status: 400 });
  }

  const url = new URL(request.url);
  const status = await AIService.inspect(provider, {
    force: url.searchParams.get("refresh") === "true",
    signal: request.signal,
  });
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}

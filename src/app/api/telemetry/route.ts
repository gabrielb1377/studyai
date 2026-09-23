import { NextResponse } from "next/server";
import { Telemetry } from "@/server/observability/Telemetry";
import { rateLimit } from "@/server/security/RateLimit";

const allowed = new Set(["LCP", "CLS", "INP", "FCP", "TTFB", "navigation", "long-task"]);

export async function POST(request: Request) {
  const key = request.headers.get("x-device-id")?.slice(0, 80) || "anonymous";
  if (!rateLimit(`telemetry:${key}`, 120, 60_000).allowed) return NextResponse.json({ ok: false }, { status: 429 });
  const body = await request.json().catch(() => null) as { name?: string; value?: number; unit?: string } | null;
  if (!body || !body.name || !allowed.has(body.name) || !Number.isFinite(body.value)) return NextResponse.json({ error: "Métrica inválida." }, { status: 400 });
  Telemetry.metric({ name: body.name, value: Number(body.value), unit: body.unit === "score" ? "score" : "ms", source: "client" });
  return NextResponse.json({ ok: true });
}

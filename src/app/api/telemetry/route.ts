import { NextResponse } from "next/server";
import { Telemetry } from "@/server/observability/Telemetry";
import { rateLimit } from "@/server/security/RateLimit";

const allowed = new Set(["LCP", "CLS", "INP", "FCP", "TTFB", "navigation", "long-task"]);
type TelemetryPayload = { name?: string; value?: number; unit?: string };

export async function POST(request: Request) {
  const key = request.headers.get("x-real-ip")
    ?? request.headers.get("cf-connecting-ip")
    ?? "anonymous";
  if (!rateLimit(`telemetry:${key}`, 120, 60_000).allowed) return NextResponse.json({ ok: false }, { status: 429 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4_096) return NextResponse.json({ error: "Métrica muito grande." }, { status: 413 });
  const raw = await request.text().catch(() => "");
  if (new TextEncoder().encode(raw).byteLength > 4_096) return NextResponse.json({ error: "Métrica muito grande." }, { status: 413 });
  let body: TelemetryPayload | null = null;
  try {
    body = JSON.parse(raw || "null") as TelemetryPayload | null;
  } catch {
    return NextResponse.json({ error: "Métrica inválida." }, { status: 400 });
  }
  if (!body || !body.name || !allowed.has(body.name) || !Number.isFinite(body.value)) return NextResponse.json({ error: "Métrica inválida." }, { status: 400 });
  Telemetry.metric({ name: body.name, value: Number(body.value), unit: body.unit === "score" ? "score" : "ms", source: "client" });
  return NextResponse.json({ ok: true });
}

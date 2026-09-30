import { NextResponse } from "next/server";
import { EmailService } from "@/server/auth/EmailService";
import { Telemetry } from "@/server/observability/Telemetry";
import { rateLimit, requestAddress } from "@/server/security/RateLimit";

const MAX_BODY_BYTES = 24 * 1024;
const MAX_FIELD_LENGTH = 4_000;

type FeedbackPayload = {
  kind?: "feedback" | "issue";
  ratings?: { overall?: number; interface?: number; ai?: number; performance?: number };
  liked?: string;
  confusing?: string;
  blocked?: string;
  missing?: string;
  suggestion?: string;
  screen?: string;
  action?: string;
  description?: string;
  device?: string;
  browser?: string;
  occurredAt?: string;
  contactEmail?: string;
};

function text(value: unknown, max = MAX_FIELD_LENGTH) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function rating(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5 ? Number(value) : 0;
}

export async function POST(request: Request) {
  const limit = rateLimit(`beta-feedback:${requestAddress(request)}`, 5, 10 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Aguarde antes de enviar outro relato." }, { status: 429 });
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return NextResponse.json({ error: "O relato excede o limite permitido." }, { status: 413 });
  const raw = await request.text().catch(() => "");
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return NextResponse.json({ error: "O relato excede o limite permitido." }, { status: 413 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Relato inválido." }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NextResponse.json({ error: "Relato inválido." }, { status: 400 });
  const body = parsed as FeedbackPayload;
  if (body.kind !== "feedback" && body.kind !== "issue") return NextResponse.json({ error: "Tipo de relato inválido." }, { status: 400 });
  const description = text(body.description);
  if (description.length < 10) return NextResponse.json({ error: "Descreva sua experiência com pelo menos 10 caracteres." }, { status: 400 });
  const ratings = body.kind === "feedback" ? {
    overall: rating(body.ratings?.overall),
    interface: rating(body.ratings?.interface),
    ai: rating(body.ratings?.ai),
    performance: rating(body.ratings?.performance),
  } : undefined;
  if (ratings && Object.values(ratings).some((value) => value === 0)) return NextResponse.json({ error: "Avalie todos os quatro aspectos." }, { status: 400 });
  const contactEmail = text(body.contactEmail, 254);
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return NextResponse.json({ error: "Email para contato inválido." }, { status: 400 });
  const occurredAt = Number.isFinite(Date.parse(text(body.occurredAt))) ? new Date(text(body.occurredAt)).toISOString() : new Date().toISOString();
  try {
    const delivered = await EmailService.sendBetaFeedback({
      kind: body.kind,
      ratings,
      liked: text(body.liked),
      confusing: text(body.confusing),
      blocked: text(body.blocked),
      missing: text(body.missing),
      suggestion: text(body.suggestion),
      screen: text(body.screen, 300),
      action: text(body.action, 500),
      description,
      device: text(body.device, 300),
      browser: text(body.browser, 500),
      occurredAt,
      contactEmail: contactEmail || undefined,
    });
    if (!delivered) return NextResponse.json({ error: "O canal de feedback ainda não está configurado neste ambiente." }, { status: 503 });
    Telemetry.metric({ name: "beta-feedback", value: 1, unit: "count", source: "server" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    Telemetry.error("beta-feedback-delivery", error);
    return NextResponse.json({ error: "Não foi possível enviar agora. Tente novamente mais tarde." }, { status: 502 });
  }
}

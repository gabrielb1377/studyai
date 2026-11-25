import "server-only";
import nodemailer from "nodemailer";

function smtpPassword(): string | undefined {
  const password = process.env.SMTP_PASSWORD?.trim() || process.env.SMTP_PASS?.trim();
  return password || undefined;
}

function emailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || process.env.SMTP_FROM?.trim() || "StudyAI <noreply@studyai.local>";
}

function transport() {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = smtpPassword();
  const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  return nodemailer.createTransport({
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    secure,
    requireTLS: process.env.NODE_ENV === "production" && !secure && !isLoopback,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

export const EmailService = {
  configured() {
    return Boolean(process.env.SMTP_HOST?.trim());
  },
  requireConfiguration() {
    if (process.env.NODE_ENV === "production" && !process.env.SMTP_HOST?.trim()) {
      throw new Error("Serviço de email não configurado.");
    }
  },
  async sendVerification(email: string, token: string, origin: string) {
    const client = transport();
    if (!client) {
      if (process.env.NODE_ENV === "production") throw new Error("Serviço de email não configurado.");
      return false;
    }
    const url = `${origin}/conta?verify=${encodeURIComponent(token)}`;
    await client.sendMail({
      from: emailFrom(),
      to: email,
      subject: "Verifique seu email no StudyAI",
      text: `Confirme seu email: ${url}`,
      html: `<p>Confirme seu email no StudyAI:</p><p><a href="${url}">Verificar email</a></p>`,
    });
    return true;
  },
  async sendRecovery(email: string, token: string, origin: string) {
    const client = transport();
    if (!client) {
      if (process.env.NODE_ENV === "production") throw new Error("Serviço de email não configurado.");
      return false;
    }
    const url = `${origin}/conta?reset=${encodeURIComponent(token)}`;
    await client.sendMail({
      from: emailFrom(),
      to: email,
      subject: "Redefina sua senha do StudyAI",
      text: `Redefina sua senha: ${url}`,
      html: `<p>Use o link abaixo para redefinir sua senha:</p><p><a href="${url}">Redefinir senha</a></p>`,
    });
    return true;
  },
  async sendBetaFeedback(input: {
    kind: "feedback" | "issue";
    ratings?: { overall: number; interface: number; ai: number; performance: number };
    liked?: string;
    confusing?: string;
    blocked?: string;
    missing?: string;
    suggestion?: string;
    screen?: string;
    action?: string;
    description: string;
    device?: string;
    browser?: string;
    occurredAt: string;
    contactEmail?: string;
  }) {
    const client = transport();
    const destination = process.env.FEEDBACK_EMAIL?.trim();
    if (!client || !destination) return false;
    const lines = [
      `Tipo: ${input.kind === "issue" ? "Problema" : "Feedback"}`,
      `Data: ${input.occurredAt}`,
      input.ratings ? `Notas: geral ${input.ratings.overall}/5 | interface ${input.ratings.interface}/5 | IA ${input.ratings.ai}/5 | performance ${input.ratings.performance}/5` : "",
      input.screen ? `Tela: ${input.screen}` : "",
      input.action ? `Ação: ${input.action}` : "",
      input.device ? `Dispositivo: ${input.device}` : "",
      input.browser ? `Navegador: ${input.browser}` : "",
      input.liked ? `O que funcionou bem:\n${input.liked}` : "",
      input.confusing ? `O que ficou confuso:\n${input.confusing}` : "",
      input.blocked ? `O que impediu o uso:\n${input.blocked}` : "",
      input.missing ? `O que faltou:\n${input.missing}` : "",
      input.suggestion ? `Sugestão:\n${input.suggestion}` : "",
      `Descrição:\n${input.description}`,
      input.contactEmail ? `Contato autorizado: ${input.contactEmail}` : "Contato não autorizado.",
    ].filter(Boolean);
    await client.sendMail({
      from: emailFrom(),
      to: destination,
      replyTo: input.contactEmail,
      subject: `[StudyAI Beta] ${input.kind === "issue" ? "Problema reportado" : "Novo feedback"}`,
      text: lines.join("\n\n"),
    });
    return true;
  },
};

import "server-only";
import nodemailer from "nodemailer";

function transport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
}

export const EmailService = {
  configured() { return Boolean(process.env.SMTP_HOST); },
  requireConfiguration() { if (process.env.NODE_ENV === "production" && !process.env.SMTP_HOST) throw new Error("Serviço de email não configurado."); },
  async sendVerification(email: string, token: string, origin: string) {
    const client = transport();
    if (!client) { if (process.env.NODE_ENV === "production") throw new Error("Serviço de email não configurado."); return false; }
    await client.sendMail({ from: process.env.EMAIL_FROM ?? "StudyAI <noreply@studyai.local>", to: email, subject: "Verifique seu email no StudyAI", text: `Confirme seu email: ${origin}/conta?verify=${encodeURIComponent(token)}`, html: `<p>Confirme seu email no StudyAI:</p><p><a href="${origin}/conta?verify=${encodeURIComponent(token)}">Verificar email</a></p>` });
    return true;
  },
  async sendRecovery(email: string, token: string, origin: string) {
    const client = transport();
    if (!client) { if (process.env.NODE_ENV === "production") throw new Error("Serviço de email não configurado."); return false; }
    await client.sendMail({ from: process.env.EMAIL_FROM ?? "StudyAI <noreply@studyai.local>", to: email, subject: "Redefina sua senha do StudyAI", text: `Redefina sua senha: ${origin}/conta?reset=${encodeURIComponent(token)}`, html: `<p>Use o link abaixo para redefinir sua senha:</p><p><a href="${origin}/conta?reset=${encodeURIComponent(token)}">Redefinir senha</a></p>` });
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
    const destination = process.env.FEEDBACK_EMAIL;
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
      from: process.env.EMAIL_FROM ?? "StudyAI <noreply@studyai.local>",
      to: destination,
      replyTo: input.contactEmail,
      subject: `[StudyAI Beta] ${input.kind === "issue" ? "Problema reportado" : "Novo feedback"}`,
      text: lines.join("\n\n"),
    });
    return true;
  },
};

import "server-only";
import { NextResponse } from "next/server";
import { AuthService, type AccessClaims } from "./AuthService";
import { constantTimeEqual } from "@/server/security/Crypto";

export const authCookies = { access: "studyai_access", refresh: "studyai_refresh", csrf: "studyai_csrf", session: "studyai_session" } as const;

export function setAuthCookies(response: NextResponse, tokens: { accessToken: string; refreshToken: string; csrfToken: string; expiresIn: number; rememberDevice?: boolean }) {
  const secure = process.env.NODE_ENV === "production";
  const persistence = tokens.rememberDevice === false ? {} : { maxAge: 30 * 24 * 60 * 60 };
  const accessPersistence = tokens.rememberDevice === false ? {} : { maxAge: tokens.expiresIn };
  response.cookies.set(authCookies.access, tokens.accessToken, { httpOnly: true, sameSite: "strict", secure, path: "/", ...accessPersistence });
  response.cookies.set(authCookies.refresh, tokens.refreshToken, { httpOnly: true, sameSite: "strict", secure, path: "/", ...persistence });
  response.cookies.set(authCookies.csrf, tokens.csrfToken, { httpOnly: false, sameSite: "strict", secure, path: "/", ...persistence });
  response.cookies.set(authCookies.session, "1", { httpOnly: false, sameSite: "strict", secure, path: "/", ...persistence });
}

export function clearAuthCookies(response: NextResponse) { for (const name of Object.values(authCookies)) response.cookies.set(name, "", { path: "/", maxAge: 0 }); }

function cookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function requireUser(request: Request): AccessClaims {
  const user = AuthService.access(cookie(request, authCookies.access));
  if (!user) throw new Response(JSON.stringify({ error: "AUTH_REQUIRED" }), { status: 401, headers: { "content-type": "application/json" } });
  return user;
}

export function requireCsrf(request: Request) {
  const header = request.headers.get("x-csrf-token") ?? "";
  const value = cookie(request, authCookies.csrf) ?? "";
  if (!header || !value || !constantTimeEqual(header, value)) throw new Response(JSON.stringify({ error: "CSRF_INVALID" }), { status: 403, headers: { "content-type": "application/json" } });
}

export function readCookie(request: Request, name: keyof typeof authCookies) { return cookie(request, authCookies[name]); }
export async function jsonBody<T>(request: Request) { try { return await request.json() as T; } catch { throw new Response(JSON.stringify({ error: "JSON_INVALID" }), { status: 400, headers: { "content-type": "application/json" } }); } }

export function publicOrigin(request: Request) {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    const url = new URL(configured);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      throw new Error("APP_URL deve usar HTTPS em produção.");
    }
    return url.origin;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL não foi configurada para produção.");
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost && forwardedProtocol) return `${forwardedProtocol}://${forwardedHost}`;
  return new URL(request.url).origin;
}

export function apiError(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Não foi possível concluir a solicitação.";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const unavailable = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "57P01", "53300"]);
  if (unavailable.has(code) || /não (?:foi )?configurad[oa] para produção|temporarily unavailable/i.test(message)) {
    return NextResponse.json({ error: "Serviço temporariamente indisponível. Tente novamente em instantes." }, { status: 503 });
  }
  const status = message === "EMAIL_EXISTS" ? 409 : 400;
  return NextResponse.json({ error: message === "EMAIL_EXISTS" ? "Este email já está cadastrado." : message }, { status });
}

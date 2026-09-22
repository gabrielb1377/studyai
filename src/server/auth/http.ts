import "server-only";
import { NextResponse } from "next/server";
import { AuthService, type AccessClaims } from "./AuthService";
import { constantTimeEqual } from "@/server/security/Crypto";

export const authCookies = { access: "studyai_access", refresh: "studyai_refresh", csrf: "studyai_csrf", session: "studyai_session" } as const;

export function setAuthCookies(response: NextResponse, tokens: { accessToken: string; refreshToken: string; csrfToken: string; expiresIn: number }) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(authCookies.access, tokens.accessToken, { httpOnly: true, sameSite: "strict", secure, path: "/", maxAge: tokens.expiresIn });
  response.cookies.set(authCookies.refresh, tokens.refreshToken, { httpOnly: true, sameSite: "strict", secure, path: "/", maxAge: 30 * 24 * 60 * 60 });
  response.cookies.set(authCookies.csrf, tokens.csrfToken, { httpOnly: false, sameSite: "strict", secure, path: "/", maxAge: 30 * 24 * 60 * 60 });
  response.cookies.set(authCookies.session, "1", { httpOnly: false, sameSite: "strict", secure, path: "/", maxAge: 30 * 24 * 60 * 60 });
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
export function apiError(error: unknown) { if (error instanceof Response) return error; const message = error instanceof Error ? error.message : "Não foi possível concluir a solicitação."; const status = message === "EMAIL_EXISTS" ? 409 : 400; return NextResponse.json({ error: message === "EMAIL_EXISTS" ? "Este email já está cadastrado." : message }, { status }); }

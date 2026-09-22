import { NextResponse } from "next/server";
import { AuthService } from "@/server/auth/AuthService";
import { apiError, readCookie, requireCsrf, setAuthCookies } from "@/server/auth/http";

export async function POST(request: Request) { try { requireCsrf(request);const refresh = readCookie(request, "refresh"); if (!refresh) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 }); const result = await AuthService.refresh(refresh); const response = NextResponse.json({ ok: true, expiresIn: result.expiresIn }); setAuthCookies(response, result); return response; } catch (error) { return apiError(error); } }

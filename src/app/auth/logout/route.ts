import { NextResponse } from "next/server";
import { AuthService } from "@/server/auth/AuthService";
import { apiError, clearAuthCookies, readCookie, requireCsrf } from "@/server/auth/http";

export async function POST(request: Request) { try { requireCsrf(request); await AuthService.logout(readCookie(request, "refresh")); const response = NextResponse.json({ ok: true }); clearAuthCookies(response); return response; } catch (error) { return apiError(error); } }


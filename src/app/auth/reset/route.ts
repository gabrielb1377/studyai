import { NextResponse } from "next/server";
import { AuthService } from "@/server/auth/AuthService";
import { apiError, jsonBody } from "@/server/auth/http";
export async function POST(request: Request) { try { const { token, password } = await jsonBody<{ token: string; password: string }>(request); await AuthService.resetPassword(token, password); return NextResponse.json({ ok: true }); } catch (error) { return apiError(error); } }


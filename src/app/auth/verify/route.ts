import { NextResponse } from "next/server";
import { AuthService } from "@/server/auth/AuthService";
import { apiError, jsonBody } from "@/server/auth/http";
export async function POST(request: Request) { try { const { token } = await jsonBody<{ token: string }>(request); await AuthService.verifyEmail(token); return NextResponse.json({ ok: true }); } catch (error) { return apiError(error); } }


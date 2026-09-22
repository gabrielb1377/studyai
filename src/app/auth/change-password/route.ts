import { NextResponse } from "next/server";
import { AuthService } from "@/server/auth/AuthService";
import { apiError, jsonBody, requireCsrf, requireUser, setAuthCookies } from "@/server/auth/http";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
export async function POST(request: Request) { try { requireCsrf(request); const user=requireUser(request); const body=await jsonBody<{currentPassword:string;password:string}>(request); await AuthService.changePassword(user.sub,body.currentPassword,body.password);const account=await CloudDatabase.userById(user.sub);if(!account)throw new Error("Conta não encontrada.");const tokens=await AuthService.createSession(user.sub,account.email,user.sessionId,request.headers.get("user-agent")??"Navegador");const response=NextResponse.json({ok:true});setAuthCookies(response,tokens);return response; } catch(error){return apiError(error);} }

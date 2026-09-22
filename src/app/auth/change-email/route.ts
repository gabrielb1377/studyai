import { NextResponse } from "next/server";
import { AuthService } from "@/server/auth/AuthService";
import { apiError, jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { EmailService } from "@/server/auth/EmailService";
export async function POST(request: Request) { try { requireCsrf(request);EmailService.requireConfiguration(); const user=requireUser(request); const body=await jsonBody<{password:string;email:string}>(request); const result=await AuthService.changeEmail(user.sub,body.password,body.email);await EmailService.sendVerification(result.email,result.verificationToken,new URL(request.url).origin);return NextResponse.json({ok:true,verificationToken:process.env.NODE_ENV==="production"?undefined:result.verificationToken}); } catch(error){return apiError(error);} }

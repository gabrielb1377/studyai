import { NextResponse } from "next/server";
import { jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { CollaborationService } from "@/server/collaboration/CollaborationService";
import { collaborationError, collaborationRateLimit } from "@/server/collaboration/http";
export async function POST(request:Request){try{requireCsrf(request);const user=requireUser(request);collaborationRateLimit(user.sub);const body=await jsonBody<{token?:unknown}>(request);return NextResponse.json({room:await CollaborationService.join(user.sub,body.token)});}catch(error){return collaborationError(error);}}

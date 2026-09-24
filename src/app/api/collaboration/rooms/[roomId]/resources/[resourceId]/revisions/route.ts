import { NextResponse } from "next/server";
import { jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { CollaborationService } from "@/server/collaboration/CollaborationService";
import { collaborationError, collaborationRateLimit } from "@/server/collaboration/http";
type Context={params:Promise<{roomId:string;resourceId:string}>};
export async function GET(request:Request,{params}:Context){try{const user=requireUser(request);const{roomId,resourceId}=await params;return NextResponse.json({revisions:await CollaborationService.revisions(roomId,user.sub,resourceId)});}catch(error){return collaborationError(error);}}
export async function POST(request:Request,{params}:Context){try{requireCsrf(request);const user=requireUser(request);collaborationRateLimit(user.sub);const{roomId,resourceId}=await params;const body=await jsonBody<{version?:unknown}>(request);return NextResponse.json({resource:await CollaborationService.restoreResource(roomId,user.sub,resourceId,Number(body.version))});}catch(error){return collaborationError(error);}}

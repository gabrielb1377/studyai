import { NextResponse } from "next/server";
import { jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { ClassroomService } from "@/server/collaboration/ClassroomService";
import { collaborationError, collaborationRateLimit } from "@/server/collaboration/http";
type Context={params:Promise<{roomId:string}>};
export async function POST(request:Request,{params}:Context){try{requireCsrf(request);const user=requireUser(request);collaborationRateLimit(user.sub);const{roomId}=await params;const body=await jsonBody<Record<string,unknown>>(request);return NextResponse.json({progress:await ClassroomService.recordProgress(roomId,user.sub,body)});}catch(error){return collaborationError(error);}}

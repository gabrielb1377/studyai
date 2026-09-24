import { NextResponse } from "next/server";
import { jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { CollaborationService } from "@/server/collaboration/CollaborationService";
import { collaborationError, collaborationRateLimit } from "@/server/collaboration/http";
type Context={params:Promise<{roomId:string}>};
export async function PATCH(request:Request,{params}:Context){try{requireCsrf(request);const user=requireUser(request);collaborationRateLimit(user.sub);const{roomId}=await params;const body=await jsonBody<{userId?:unknown;role?:unknown}>(request);await CollaborationService.changeMember(roomId,user.sub,body.userId,body.role);return NextResponse.json({ok:true});}catch(error){return collaborationError(error);}}
export async function DELETE(request:Request,{params}:Context){try{requireCsrf(request);const user=requireUser(request);collaborationRateLimit(user.sub);const{roomId}=await params;const body=await jsonBody<{userId?:unknown}>(request);await CollaborationService.removeMember(roomId,user.sub,body.userId??user.sub);return NextResponse.json({ok:true});}catch(error){return collaborationError(error);}}

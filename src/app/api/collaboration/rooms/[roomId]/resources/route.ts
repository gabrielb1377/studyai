import { NextResponse } from "next/server";
import { jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { CollaborationService } from "@/server/collaboration/CollaborationService";
import { collaborationError, collaborationRateLimit } from "@/server/collaboration/http";
type Context={params:Promise<{roomId:string}>};
export async function POST(request:Request,{params}:Context){try{requireCsrf(request);const user=requireUser(request);collaborationRateLimit(user.sub);const{roomId}=await params;const body=await jsonBody<Record<string,unknown>>(request);return NextResponse.json({resource:await CollaborationService.saveResource(roomId,user.sub,body)},{status:201});}catch(error){return collaborationError(error);}}
export async function PATCH(request:Request,{params}:Context){try{requireCsrf(request);const user=requireUser(request);collaborationRateLimit(user.sub);const{roomId}=await params;const body=await jsonBody<Record<string,unknown>>(request);return NextResponse.json({resource:await CollaborationService.saveResource(roomId,user.sub,body)});}catch(error){return collaborationError(error);}}
export async function DELETE(request:Request,{params}:Context){try{requireCsrf(request);const user=requireUser(request);collaborationRateLimit(user.sub);const{roomId}=await params;const body=await jsonBody<{id?:unknown}>(request);await CollaborationService.removeResource(roomId,user.sub,body.id);return NextResponse.json({ok:true});}catch(error){return collaborationError(error);}}

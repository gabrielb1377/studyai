import { NextResponse } from "next/server";
import { jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { CollaborationService } from "@/server/collaboration/CollaborationService";
import { collaborationError, collaborationRateLimit } from "@/server/collaboration/http";

type Context={params:Promise<{roomId:string}>};
export async function GET(request:Request,{params}:Context){try{const user=requireUser(request);const{roomId}=await params;return NextResponse.json(await CollaborationService.snapshot(roomId,user.sub));}catch(error){return collaborationError(error);}}
export async function PATCH(request:Request,{params}:Context){try{requireCsrf(request);const user=requireUser(request);collaborationRateLimit(user.sub);const{roomId}=await params;const body=await jsonBody<{name?:unknown;description?:unknown}>(request);return NextResponse.json({room:await CollaborationService.updateRoom(roomId,user.sub,body)});}catch(error){return collaborationError(error);}}
export async function DELETE(request:Request,{params}:Context){try{requireCsrf(request);const user=requireUser(request);collaborationRateLimit(user.sub);const{roomId}=await params;await CollaborationService.removeRoom(roomId,user.sub);return NextResponse.json({ok:true});}catch(error){return collaborationError(error);}}

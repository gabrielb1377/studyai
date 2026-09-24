import { NextResponse } from "next/server";
import { jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
import { CollaborationService } from "@/server/collaboration/CollaborationService";
import { collaborationError, collaborationRateLimit } from "@/server/collaboration/http";
export async function POST(request:Request){try{requireCsrf(request);const user=requireUser(request);collaborationRateLimit(user.sub);const body=await jsonBody<{roomId?:unknown;role?:unknown;expiresAt?:unknown;maxUses?:unknown}>(request);const roomId=typeof body.roomId==="string"?body.roomId:"";const invite=await CollaborationService.invite(roomId,user.sub,body);return NextResponse.json({invite,url:`${new URL(request.url).origin}/salas?convite=${invite.token}`},{status:201});}catch(error){return collaborationError(error);}}

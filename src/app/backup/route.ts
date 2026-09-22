import { NextResponse } from "next/server";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { SyncService } from "@/server/cloud/SyncService";
import { apiError, jsonBody, requireCsrf, requireUser } from "@/server/auth/http";
export async function GET(request:Request){try{const user=requireUser(request);const backups=await CloudDatabase.backups(user.sub);return NextResponse.json({backups:backups.map((item)=>({id:item.id,userId:item.userId,sizeBytes:item.sizeBytes,createdAt:item.createdAt}))});}catch(error){return apiError(error);}}
export async function POST(request:Request){try{requireCsrf(request);const user=requireUser(request);const body=await jsonBody<{action?:"create"|"restore";backupId?:string;deviceId?:string}>(request);if(body.action==="restore"&&body.backupId)return NextResponse.json({restored:await SyncService.restore(user.sub,body.backupId,body.deviceId??"unknown")});return NextResponse.json({backup:await CloudDatabase.createBackup(user.sub)},{status:201});}catch(error){return apiError(error);}}

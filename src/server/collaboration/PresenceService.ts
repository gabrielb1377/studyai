import "server-only";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { CollaborationDatabase } from "./CollaborationDatabase";
import { PermissionsService } from "./PermissionsService";

export const PresenceService = {
  async heartbeat(roomId:string,userId:string,input:{status?:unknown;resourceId?:unknown}){const member=await CollaborationDatabase.member(roomId,userId);PermissionsService.assert(member?.role,"read");const profile=await CloudDatabase.profile(userId);const status=input.status==="typing"||input.status==="away"?input.status:"studying";const presence={roomId,userId,name:profile?.name??member!.name,status,resourceId:typeof input.resourceId==="string"?input.resourceId.slice(0,80):undefined,lastSeenAt:new Date().toISOString()} as const;await CollaborationDatabase.setPresence(presence);return presence;},
};

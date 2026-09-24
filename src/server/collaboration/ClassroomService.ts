import "server-only";
import { CollaborationService } from "./CollaborationService";
import { CollaborationDatabase } from "./CollaborationDatabase";
import { PermissionsService } from "./PermissionsService";

export const ClassroomService = {
  create(teacherId: string, input: { name?: unknown; description?: unknown }) {
    return CollaborationService.createRoom(teacherId, { ...input, kind: "classroom" });
  },
  async recordProgress(roomId:string,userId:string,input:{resourceId?:unknown;mode?:unknown;completed?:unknown;total?:unknown;score?:unknown}){
    const member=await CollaborationDatabase.member(roomId,userId);PermissionsService.assert(member?.role,"read");
    const resourceId=typeof input.resourceId==="string"?input.resourceId.slice(0,80):"";const resource=(await CollaborationDatabase.resources(roomId)).find((item)=>item.id===resourceId);if(!resource)throw new Error("RESOURCE_NOT_FOUND");
    const mode=input.mode==="group"||input.mode==="teacher"?input.mode:"individual";const total=Math.max(0,Math.floor(Number(input.total)||0));const completed=Math.min(total,Math.max(0,Math.floor(Number(input.completed)||0)));const score=Number.isFinite(Number(input.score))?Math.min(100,Math.max(0,Number(input.score))):undefined;
    return CollaborationDatabase.saveProgress({roomId,resourceId,userId,mode,completed,total,score,updatedAt:new Date().toISOString()});
  },
};

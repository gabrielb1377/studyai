import "server-only";
import { collaborationResourceTypes, type CollaborationResourceType } from "@/features/collaboration/types";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { CollaborationDatabase } from "./CollaborationDatabase";
import { PermissionsService } from "./PermissionsService";

const targetTypes = [...collaborationResourceTypes, "chapter", "concept"] as const;
export const CommentService = {
  async add(roomId:string,userId:string,input:{targetType?:unknown;targetId?:unknown;parentId?:unknown;anchor?:unknown;content?:unknown}){const member=await CollaborationDatabase.member(roomId,userId);PermissionsService.assert(member?.role,"comment");const content=typeof input.content==="string"?input.content.trim().slice(0,4000):"";if(!content)throw new Error("O comentário está vazio.");if(!targetTypes.includes(input.targetType as typeof targetTypes[number]))throw new Error("Destino do comentário inválido.");const profile=await CloudDatabase.profile(userId);const item=await CollaborationDatabase.addComment({roomId,targetType:input.targetType as CollaborationResourceType|"chapter"|"concept",targetId:String(input.targetId??"").slice(0,120),parentId:typeof input.parentId==="string"?input.parentId.slice(0,80):undefined,anchor:typeof input.anchor==="string"?input.anchor.slice(0,240):undefined,content,authorId:userId,authorName:profile?.name??member?.name??"Participante"});await CollaborationDatabase.log({roomId,actorId:userId,actorName:item.authorName,action:item.parentId?"comment.replied":"comment.created",targetType:"comment",targetId:item.id});return item;},
};

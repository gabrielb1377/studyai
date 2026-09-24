import "server-only";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { collaborationResourceTypes, collaborationRoles, type CollaborationResourceType, type CollaborationRole, type StudyRoom } from "@/features/collaboration/types";
import { CollaborationDatabase } from "./CollaborationDatabase";
import { PermissionsService, type CollaborationAction } from "./PermissionsService";

const compact = (value: unknown, max: number) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

async function actorName(userId: string) {
  const profile = await CloudDatabase.profile(userId);
  const user = await CloudDatabase.userById(userId);
  return profile?.name ?? user?.email ?? "Participante";
}

async function assertMember(roomId: string, userId: string, action: CollaborationAction) {
  const member = await CollaborationDatabase.member(roomId, userId);
  PermissionsService.assert(member?.role, action);
  return member!;
}

export const CollaborationService = {
  listRooms: (userId: string) => CollaborationDatabase.roomsFor(userId),
  async createRoom(userId: string, input: { name?: unknown; description?: unknown; kind?: unknown }) {
    const name = compact(input.name, 80); if (name.length < 2) throw new Error("Informe um nome para a sala.");
    const kind: StudyRoom["kind"] = input.kind === "classroom" ? "classroom" : "study";
    const room = await CollaborationDatabase.createRoom(userId, name, compact(input.description, 280), kind);
    await CollaborationDatabase.log({ roomId: room.id, actorId: userId, actorName: await actorName(userId), action: "room.created", targetType: "room", targetId: room.id });
    return room;
  },
  async snapshot(roomId: string, userId: string) {
    const member = await assertMember(roomId, userId, "read"); const room = await CollaborationDatabase.room(roomId);
    if (!room) throw new Error("Sala não encontrada.");
    const [members, resources, comments, presence, activity, progress] = await Promise.all([CollaborationDatabase.members(roomId), CollaborationDatabase.resources(roomId), CollaborationDatabase.comments(roomId), CollaborationDatabase.presence(roomId), CollaborationDatabase.activity(roomId), CollaborationDatabase.progress(roomId)]);
    return { room, currentRole: member.role, members, resources, comments, presence, activity, progress };
  },
  async updateRoom(roomId: string, userId: string, input: { name?: unknown; description?: unknown }) {
    await assertMember(roomId, userId, "manage-members");
    const room = await CollaborationDatabase.updateRoom(roomId, { name: compact(input.name, 80) || undefined, description: typeof input.description === "string" ? compact(input.description, 280) : undefined });
    if (!room) throw new Error("Sala não encontrada.");
    await CollaborationDatabase.log({ roomId, actorId: userId, actorName: await actorName(userId), action: "room.updated", targetType: "room", targetId: roomId }); return room;
  },
  async removeRoom(roomId: string, userId: string) { await assertMember(roomId,userId,"delete-room"); await CollaborationDatabase.deleteRoom(roomId); },
  async invite(roomId:string,userId:string,input:{role?:unknown;expiresAt?:unknown;maxUses?:unknown}){await assertMember(roomId,userId,"manage-members");const role=collaborationRoles.includes(input.role as CollaborationRole)&&input.role!=="admin"?input.role as Exclude<CollaborationRole,"admin">:"reader";const expiresAt=typeof input.expiresAt==="string"&&Number.isFinite(Date.parse(input.expiresAt))?new Date(input.expiresAt).toISOString():undefined;const maxUses=Math.min(100,Math.max(1,Number(input.maxUses)||25));const invite=await CollaborationDatabase.createInvite(roomId,userId,role,expiresAt,maxUses);await CollaborationDatabase.log({roomId,actorId:userId,actorName:await actorName(userId),action:"invite.created",targetType:"invite",targetId:invite.id,details:{role}});return invite;},
  async join(userId:string,token:unknown){const value=compact(token,160);const invite=await CollaborationDatabase.invite(value);if(!invite)throw new Error("Convite inválido ou expirado.");const user=await CloudDatabase.userById(userId);const profile=await CloudDatabase.profile(userId);if(!user)throw new Error("Conta não encontrada.");await CollaborationDatabase.join(invite,userId,profile?.name??user.email,user.email);await CollaborationDatabase.log({roomId:invite.roomId,actorId:userId,actorName:profile?.name??user.email,action:"member.joined",targetType:"member",targetId:userId});return CollaborationDatabase.room(invite.roomId);},
  async changeMember(roomId:string,userId:string,targetUserId:unknown,role:unknown){await assertMember(roomId,userId,"manage-members");const target=compact(targetUserId,80);if(target===userId)throw new Error("Transfira a administração antes de alterar seu próprio papel.");if(!collaborationRoles.includes(role as CollaborationRole))throw new Error("Papel inválido.");const room=await CollaborationDatabase.room(roomId);if(!room)throw new Error("Sala não encontrada.");if(!await CollaborationDatabase.member(roomId,target))throw new Error("Participante não encontrado.");if(role==="admin"){await CollaborationDatabase.setRole(roomId,userId,"editor");await CollaborationDatabase.updateRoom(roomId,{ownerId:target});}await CollaborationDatabase.setRole(roomId,target,role as CollaborationRole);await CollaborationDatabase.log({roomId,actorId:userId,actorName:await actorName(userId),action:"member.role-changed",targetType:"member",targetId:target,details:{role}});},
  async removeMember(roomId:string,userId:string,targetUserId:unknown){const actor=await assertMember(roomId,userId,"read");const target=compact(targetUserId,80);if(target!==userId)PermissionsService.assert(actor.role,"manage-members");if(!await CollaborationDatabase.member(roomId,target))throw new Error("Participante não encontrado.");const room=await CollaborationDatabase.room(roomId);if(room?.ownerId===target)throw new Error("Transfira a administração antes de sair ou remover o proprietário.");await CollaborationDatabase.removeMember(roomId,target);await CollaborationDatabase.log({roomId,actorId:userId,actorName:await actorName(userId),action:target===userId?"member.left":"member.removed",targetType:"member",targetId:target});},
  async saveResource(roomId:string,userId:string,input:{id?:unknown;type?:unknown;recordId?:unknown;title?:unknown;data?:unknown;expectedVersion?:unknown}){await assertMember(roomId,userId,"edit");if(!collaborationResourceTypes.includes(input.type as CollaborationResourceType))throw new Error("Tipo de recurso inválido.");const title=compact(input.title,120);if(!title)throw new Error("Informe o título do recurso.");const id=compact(input.id,80)||undefined;const resource=await CollaborationDatabase.saveResource({id,roomId,type:input.type as CollaborationResourceType,recordId:compact(input.recordId,120)||undefined,title,data:input.data??{},createdBy:userId,updatedBy:userId,expectedVersion:typeof input.expectedVersion==="number"?input.expectedVersion:undefined});await CollaborationDatabase.log({roomId,actorId:userId,actorName:await actorName(userId),action:id?"resource.updated":"resource.shared",targetType:resource.type,targetId:resource.id,details:{version:resource.version}});return resource;},
  async removeResource(roomId:string,userId:string,id:unknown){await assertMember(roomId,userId,"edit");const target=compact(id,80);await CollaborationDatabase.removeResource(roomId,target);await CollaborationDatabase.log({roomId,actorId:userId,actorName:await actorName(userId),action:"resource.removed",targetType:"resource",targetId:target});},
  async revisions(roomId:string,userId:string,resourceId:string){await assertMember(roomId,userId,"read");return CollaborationDatabase.revisions(roomId,resourceId);},
  async restoreResource(roomId:string,userId:string,resourceId:string,version:number){await assertMember(roomId,userId,"edit");const revision=(await CollaborationDatabase.revisions(roomId,resourceId)).find((item)=>item.version===version);if(!revision)throw new Error("Versão não encontrada.");const current=(await CollaborationDatabase.resources(roomId)).find((item)=>item.id===resourceId);if(!current)throw new Error("RESOURCE_NOT_FOUND");return this.saveResource(roomId,userId,{id:resourceId,type:current.type,title:revision.title,data:revision.data,expectedVersion:current.version});},
};

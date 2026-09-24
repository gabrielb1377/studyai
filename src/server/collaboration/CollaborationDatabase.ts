import "server-only";
import { randomUUID } from "node:crypto";
import { hasPostgres, query, transaction } from "@/server/database/Postgres";
import type {
  CollaborationActivity,
  CollaborationComment,
  CollaborationProgress,
  CollaborationRole,
  CollaborativeResource,
  RoomInvite,
  RoomMember,
  RoomPresence,
  StudyRoom,
} from "@/features/collaboration/types";

type MemoryState = {
  rooms: Map<string, StudyRoom>;
  members: Map<string, RoomMember>;
  invites: Map<string, RoomInvite>;
  resources: Map<string, CollaborativeResource>;
  comments: Map<string, CollaborationComment>;
  presence: Map<string, RoomPresence>;
  activity: CollaborationActivity[];
  revisions: Map<string, CollaborativeResource[]>;
  progress: Map<string, CollaborationProgress>;
};

const globalState = globalThis as typeof globalThis & { __studyAiCollaboration?: MemoryState };
const memory: MemoryState = globalState.__studyAiCollaboration ??= {
  rooms: new Map(), members: new Map(), invites: new Map(), resources: new Map(), comments: new Map(),
  presence: new Map(), activity: [], revisions: new Map(), progress: new Map(),
};
const memberKey = (roomId: string, userId: string) => `${roomId}:${userId}`;
const presenceKey = (roomId: string, userId: string) => `${roomId}:${userId}`;
const now = () => new Date().toISOString();

function roomFromRow(row: Record<string, unknown>): StudyRoom {
  return { id: String(row.id), name: String(row.name), description: String(row.description ?? ""), kind: row.kind === "classroom" ? "classroom" : "study", ownerId: String(row.owner_id), createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString() };
}

function memberFromRow(row: Record<string, unknown>): RoomMember {
  return { roomId: String(row.room_id), userId: String(row.user_id), name: String(row.name), email: String(row.email), role: String(row.role) as CollaborationRole, joinedAt: new Date(String(row.joined_at)).toISOString() };
}

export const CollaborationDatabase = {
  async createRoom(ownerId: string, name: string, description: string, kind: StudyRoom["kind"]) {
    const timestamp = now();
    const room = { id: randomUUID(), name, description, kind, ownerId, createdAt: timestamp, updatedAt: timestamp } satisfies StudyRoom;
    if (!hasPostgres()) {
      const user = await import("@/server/cloud/CloudDatabase").then(({ CloudDatabase }) => CloudDatabase.userById(ownerId));
      const profile = await import("@/server/cloud/CloudDatabase").then(({ CloudDatabase }) => CloudDatabase.profile(ownerId));
      memory.rooms.set(room.id, room);
      memory.members.set(memberKey(room.id, ownerId), { roomId: room.id, userId: ownerId, name: profile?.name ?? user?.email ?? "Administrador", email: user?.email ?? "", role: "admin", joinedAt: timestamp });
      return room;
    }
    await transaction(async (client) => {
      await client.query("INSERT INTO study_rooms (id,name,description,kind,owner_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)", [room.id, name, description, kind, ownerId, timestamp]);
      await client.query("INSERT INTO room_members (room_id,user_id,role,joined_at) VALUES ($1,$2,'admin',$3)", [room.id, ownerId, timestamp]);
    });
    return room;
  },

  async roomsFor(userId: string) {
    if (!hasPostgres()) return [...memory.rooms.values()].filter((room) => memory.members.has(memberKey(room.id, userId))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const result = await query<Record<string, unknown>>("SELECT r.* FROM study_rooms r JOIN room_members m ON m.room_id=r.id WHERE m.user_id=$1 ORDER BY r.updated_at DESC", [userId]);
    return result.rows.map(roomFromRow);
  },
  async room(roomId: string) {
    if (!hasPostgres()) return memory.rooms.get(roomId);
    const result = await query<Record<string, unknown>>("SELECT * FROM study_rooms WHERE id=$1", [roomId]);
    return result.rows[0] ? roomFromRow(result.rows[0]) : undefined;
  },
  async updateRoom(roomId: string, changes: { name?: string; description?: string; ownerId?: string }) {
    const current = await this.room(roomId); if (!current) return;
    const next = { ...current, name: changes.name ?? current.name, description: changes.description ?? current.description, ownerId: changes.ownerId ?? current.ownerId, updatedAt: now() };
    if (!hasPostgres()) { memory.rooms.set(roomId, next); return next; }
    await query("UPDATE study_rooms SET name=$2,description=$3,owner_id=$4,updated_at=$5 WHERE id=$1", [roomId,next.name,next.description,next.ownerId,next.updatedAt]); return next;
  },
  async deleteRoom(roomId: string) {
    if (!hasPostgres()) {
      memory.rooms.delete(roomId);
      for (const [key,item] of memory.members) if (item.roomId===roomId) memory.members.delete(key);
      for (const [key,item] of memory.resources) if (item.roomId===roomId) memory.resources.delete(key);
      for (const [key,item] of memory.comments) if (item.roomId===roomId) memory.comments.delete(key);
      for (const [key,item] of memory.presence) if (item.roomId===roomId) memory.presence.delete(key);
      for (const [key,item] of memory.invites) if (item.roomId===roomId) memory.invites.delete(key);
      for (const [key,item] of memory.progress) if (item.roomId===roomId) memory.progress.delete(key);
      for (const [key,items] of memory.revisions) if (items.some((item)=>item.roomId===roomId)) memory.revisions.delete(key);
      memory.activity=memory.activity.filter((item)=>item.roomId!==roomId);
      return;
    }
    await query("DELETE FROM study_rooms WHERE id=$1", [roomId]);
  },
  async member(roomId: string, userId: string) {
    if (!hasPostgres()) return memory.members.get(memberKey(roomId, userId));
    const result = await query<Record<string, unknown>>("SELECT m.*,u.email,p.name FROM room_members m JOIN users u ON u.id=m.user_id JOIN user_profiles p ON p.user_id=m.user_id WHERE m.room_id=$1 AND m.user_id=$2", [roomId, userId]);
    return result.rows[0] ? memberFromRow(result.rows[0]) : undefined;
  },
  async members(roomId: string) {
    if (!hasPostgres()) return [...memory.members.values()].filter((item) => item.roomId === roomId);
    const result = await query<Record<string, unknown>>("SELECT m.*,u.email,p.name FROM room_members m JOIN users u ON u.id=m.user_id JOIN user_profiles p ON p.user_id=m.user_id WHERE m.room_id=$1 ORDER BY m.joined_at", [roomId]);
    return result.rows.map(memberFromRow);
  },
  async setRole(roomId: string, userId: string, role: CollaborationRole) {
    if (!hasPostgres()) { const item = memory.members.get(memberKey(roomId, userId)); if (item) memory.members.set(memberKey(roomId, userId), { ...item, role }); return; }
    await query("UPDATE room_members SET role=$3 WHERE room_id=$1 AND user_id=$2", [roomId, userId, role]);
  },
  async removeMember(roomId: string, userId: string) {
    if (!hasPostgres()) { memory.members.delete(memberKey(roomId, userId)); memory.presence.delete(presenceKey(roomId, userId)); return; }
    await query("DELETE FROM room_members WHERE room_id=$1 AND user_id=$2", [roomId, userId]);
  },

  async createInvite(roomId: string, createdBy: string, role: Exclude<CollaborationRole, "admin">, expiresAt?: string, maxUses = 25) {
    const invite = { id: randomUUID(), roomId, token: `${randomUUID()}${randomUUID()}`.replaceAll("-", ""), role, createdBy, expiresAt, maxUses, uses: 0, createdAt: now() } satisfies RoomInvite;
    if (!hasPostgres()) memory.invites.set(invite.token, invite);
    else await query("INSERT INTO room_invites (id,room_id,token,role,created_by,expires_at,max_uses,uses,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8)", [invite.id, roomId, invite.token, role, createdBy, expiresAt ?? null, maxUses, invite.createdAt]);
    return invite;
  },
  async invite(token: string) {
    if (!hasPostgres()) { const invite = memory.invites.get(token); return invite && invite.uses < invite.maxUses && (!invite.expiresAt || new Date(invite.expiresAt) > new Date()) ? invite : undefined; }
    const result = await query<Record<string, unknown>>("SELECT * FROM room_invites WHERE token=$1 AND revoked_at IS NULL AND uses<max_uses AND (expires_at IS NULL OR expires_at>NOW())", [token]); const row = result.rows[0];
    return row ? { id: String(row.id), roomId: String(row.room_id), token, role: String(row.role) as Exclude<CollaborationRole, "admin">, createdBy: String(row.created_by), expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : undefined, maxUses: Number(row.max_uses), uses: Number(row.uses), createdAt: new Date(String(row.created_at)).toISOString() } satisfies RoomInvite : undefined;
  },
  async join(invite: RoomInvite, userId: string, name: string, email: string) {
    const joinedAt = now();
    if (!hasPostgres()) {
      if (memory.members.has(memberKey(invite.roomId, userId))) return;
      const current=memory.invites.get(invite.token);if(!current||current.uses>=current.maxUses||Boolean(current.expiresAt&&new Date(current.expiresAt)<=new Date()))throw new Error("Convite inválido ou expirado.");
      memory.members.set(memberKey(invite.roomId, userId), { roomId: invite.roomId, userId, name, email, role: invite.role, joinedAt });
      memory.invites.set(invite.token, { ...invite, uses: invite.uses + 1 });
      return;
    }
    await transaction(async (client) => {
      const existing=await client.query("SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2",[invite.roomId,userId]);if(existing.rowCount)return;
      const consumed=await client.query("UPDATE room_invites SET uses=uses+1 WHERE id=$1 AND revoked_at IS NULL AND uses<max_uses AND (expires_at IS NULL OR expires_at>NOW()) RETURNING id",[invite.id]);if(!consumed.rowCount)throw new Error("Convite inválido ou expirado.");
      await client.query("INSERT INTO room_members (room_id,user_id,role,joined_at) VALUES ($1,$2,$3,$4)", [invite.roomId, userId, invite.role, joinedAt]);
    });
  },

  async resources(roomId: string) {
    if (!hasPostgres()) return [...memory.resources.values()].filter((item) => item.roomId === roomId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const result = await query<Record<string, unknown>>("SELECT * FROM room_resources WHERE room_id=$1 ORDER BY updated_at DESC", [roomId]);
    return result.rows.map((row) => ({ id: String(row.id), roomId, type: String(row.type), recordId: row.record_id ? String(row.record_id) : undefined, title: String(row.title), data: row.data, version: Number(row.version), createdBy: String(row.created_by), updatedBy: String(row.updated_by), createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString() })) as CollaborativeResource[];
  },
  async revisions(roomId: string, resourceId: string) {
    if (!hasPostgres()) return (memory.revisions.get(resourceId) ?? []).filter((item) => item.roomId === roomId).sort((a,b)=>b.version-a.version);
    const result=await query<Record<string,unknown>>("SELECT r.*,x.room_id,x.type,x.record_id,x.created_by,x.created_at FROM collaboration_revisions r JOIN room_resources x ON x.id=r.resource_id WHERE x.room_id=$1 AND r.resource_id=$2 ORDER BY r.version DESC",[roomId,resourceId]);
    return result.rows.map((row)=>{const value=(row.data??{}) as {title?:unknown;data?:unknown};return{id:resourceId,roomId,type:String(row.type),recordId:row.record_id?String(row.record_id):undefined,title:String(value.title??"Versão anterior"),data:value.data??{},version:Number(row.version),createdBy:String(row.created_by),updatedBy:String(row.edited_by),createdAt:new Date(String(row.created_at)).toISOString(),updatedAt:new Date(String(row.created_at)).toISOString()};}) as CollaborativeResource[];
  },
  async saveResource(input: Omit<CollaborativeResource, "id" | "version" | "createdAt" | "updatedAt"> & { id?: string; expectedVersion?: number }) {
    const timestamp = now();
    if (!input.id) {
      const resource = { ...input, id: randomUUID(), version: 1, createdAt: timestamp, updatedAt: timestamp } satisfies CollaborativeResource;
      if (!hasPostgres()) memory.resources.set(resource.id, resource);
      else await query("INSERT INTO room_resources (id,room_id,type,record_id,title,data,version,created_by,updated_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$9)", [resource.id, resource.roomId, resource.type, resource.recordId ?? null, resource.title, JSON.stringify(resource.data), resource.createdBy, resource.updatedBy, timestamp]);
      return resource;
    }
    const current = (await this.resources(input.roomId)).find((item) => item.id === input.id);
    if (!current) throw new Error("RESOURCE_NOT_FOUND");
    if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) throw new Error("VERSION_CONFLICT");
    const next = { ...current, title: input.title, data: input.data, updatedBy: input.updatedBy, version: current.version + 1, updatedAt: timestamp };
    if (!hasPostgres()) { const history = memory.revisions.get(current.id) ?? []; history.push(current); memory.revisions.set(current.id, history.slice(-50)); memory.resources.set(current.id, next); }
    else await transaction(async (client) => { await client.query("INSERT INTO collaboration_revisions (id,resource_id,version,data,edited_by,created_at) VALUES ($1,$2,$3,$4,$5,$6)", [randomUUID(), current.id, current.version, JSON.stringify({ title: current.title, data: current.data }), input.updatedBy, timestamp]); await client.query("UPDATE room_resources SET title=$3,data=$4,version=version+1,updated_by=$5,updated_at=$6 WHERE id=$1 AND room_id=$2", [current.id, input.roomId, input.title, JSON.stringify(input.data), input.updatedBy, timestamp]); });
    return next;
  },
  async removeResource(roomId: string, id: string) {
    if (!hasPostgres()) {
      memory.resources.delete(id); memory.revisions.delete(id);
      for (const [key,item] of memory.progress) if (item.roomId===roomId&&item.resourceId===id) memory.progress.delete(key);
      for (const [key,item] of memory.comments) if (item.roomId===roomId&&item.targetId===id) memory.comments.delete(key);
      return;
    }
    await transaction(async(client)=>{await client.query("DELETE FROM collaboration_comments WHERE room_id=$1 AND target_id=$2",[roomId,id]);await client.query("DELETE FROM room_resources WHERE room_id=$1 AND id=$2",[roomId,id]);});
  },

  async comments(roomId: string) {
    if (!hasPostgres()) return [...memory.comments.values()].filter((item) => item.roomId === roomId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const result = await query<Record<string, unknown>>("SELECT c.*,p.name AS author_name FROM collaboration_comments c JOIN user_profiles p ON p.user_id=c.author_id WHERE c.room_id=$1 AND c.deleted_at IS NULL ORDER BY c.created_at", [roomId]);
    return result.rows.map((row) => ({ id: String(row.id), roomId, targetType: String(row.target_type), targetId: String(row.target_id), parentId: row.parent_id ? String(row.parent_id) : undefined, anchor: row.anchor ? String(row.anchor) : undefined, content: String(row.content), authorId: String(row.author_id), authorName: String(row.author_name), createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString() })) as CollaborationComment[];
  },
  async addComment(comment: Omit<CollaborationComment, "id" | "createdAt" | "updatedAt">) { const timestamp = now(); const item = { ...comment, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp } satisfies CollaborationComment; if (!hasPostgres()) memory.comments.set(item.id, item); else await query("INSERT INTO collaboration_comments (id,room_id,target_type,target_id,parent_id,anchor,content,author_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)", [item.id,item.roomId,item.targetType,item.targetId,item.parentId??null,item.anchor??null,item.content,item.authorId,timestamp]); return item; },

  async setPresence(presence: RoomPresence) { if (!hasPostgres()) memory.presence.set(presenceKey(presence.roomId, presence.userId), presence); else await query("INSERT INTO collaboration_presence (room_id,user_id,status,resource_id,last_seen_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (room_id,user_id) DO UPDATE SET status=EXCLUDED.status,resource_id=EXCLUDED.resource_id,last_seen_at=EXCLUDED.last_seen_at", [presence.roomId,presence.userId,presence.status,presence.resourceId??null,presence.lastSeenAt]); },
  async presence(roomId: string) { const cutoff = Date.now() - 45_000; if (!hasPostgres()) return [...memory.presence.values()].filter((item) => item.roomId === roomId && new Date(item.lastSeenAt).getTime() >= cutoff); const result=await query<Record<string,unknown>>("SELECT x.*,p.name FROM collaboration_presence x JOIN user_profiles p ON p.user_id=x.user_id WHERE x.room_id=$1 AND x.last_seen_at>NOW()-INTERVAL '45 seconds' ORDER BY x.last_seen_at DESC",[roomId]);return result.rows.map((row)=>({roomId,userId:String(row.user_id),name:String(row.name),status:String(row.status) as RoomPresence["status"],resourceId:row.resource_id?String(row.resource_id):undefined,lastSeenAt:new Date(String(row.last_seen_at)).toISOString()})); },

  async log(activity: Omit<CollaborationActivity, "id" | "createdAt">) { const item={...activity,id:randomUUID(),createdAt:now()} satisfies CollaborationActivity;if(!hasPostgres())memory.activity.unshift(item);else await query("INSERT INTO collaboration_activity (id,room_id,actor_id,action,target_type,target_id,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",[item.id,item.roomId,item.actorId,item.action,item.targetType,item.targetId??null,JSON.stringify(item.details??{}),item.createdAt]);return item; },
  async activity(roomId:string){if(!hasPostgres())return memory.activity.filter((item)=>item.roomId===roomId).slice(0,100);const result=await query<Record<string,unknown>>("SELECT a.*,p.name AS actor_name FROM collaboration_activity a JOIN user_profiles p ON p.user_id=a.actor_id WHERE a.room_id=$1 ORDER BY a.created_at DESC LIMIT 100",[roomId]);return result.rows.map((row)=>({id:String(row.id),roomId,actorId:String(row.actor_id),actorName:String(row.actor_name),action:String(row.action),targetType:String(row.target_type),targetId:row.target_id?String(row.target_id):undefined,details:(row.details??{}) as Record<string,unknown>,createdAt:new Date(String(row.created_at)).toISOString()}));},
  async saveProgress(item:CollaborationProgress){const key=`${item.roomId}:${item.resourceId}:${item.userId}`;if(!hasPostgres()){memory.progress.set(key,item);return item;}await query("INSERT INTO collaboration_progress (room_id,resource_id,user_id,mode,completed,total,score,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (room_id,resource_id,user_id) DO UPDATE SET mode=EXCLUDED.mode,completed=EXCLUDED.completed,total=EXCLUDED.total,score=EXCLUDED.score,updated_at=EXCLUDED.updated_at",[item.roomId,item.resourceId,item.userId,item.mode,item.completed,item.total,item.score??null,item.updatedAt]);return item;},
  async progress(roomId:string){if(!hasPostgres())return[...memory.progress.values()].filter((item)=>item.roomId===roomId);const result=await query<Record<string,unknown>>("SELECT * FROM collaboration_progress WHERE room_id=$1",[roomId]);return result.rows.map((row)=>({roomId,resourceId:String(row.resource_id),userId:String(row.user_id),mode:String(row.mode) as CollaborationProgress["mode"],completed:Number(row.completed),total:Number(row.total),score:row.score===null?undefined:Number(row.score),updatedAt:new Date(String(row.updated_at)).toISOString()}));},
};

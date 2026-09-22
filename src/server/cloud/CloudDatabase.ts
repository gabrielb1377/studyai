import "server-only";
import { randomUUID } from "node:crypto";
import { hasPostgres, query, transaction } from "@/server/database/Postgres";
import type { Backup, CloudRecord, CloudUser, DeviceSession, Share, SyncEntity, UserProfile } from "./types";

type MemoryState = {
  users: Map<string, CloudUser>;
  profiles: Map<string, UserProfile>;
  sessions: Map<string, DeviceSession>;
  accountTokens: Map<string, { userId: string; type: string; expiresAt: string; usedAt?: string }>;
  records: Map<string, CloudRecord>;
  logs: CloudRecord[];
  backups: Backup[];
  shares: Share[];
  files: Map<string, { userId: string; id: string; name: string; mimeType: string; hash: string; sizeBytes: number; content: Buffer; updatedAt: string }>;
};

const serverGlobal = globalThis as typeof globalThis & { __studyAiCloudMemory?: MemoryState };
const memory: MemoryState = serverGlobal.__studyAiCloudMemory ??= { users: new Map(), profiles: new Map(), sessions: new Map(), accountTokens: new Map(), records: new Map(), logs: [], backups: [], shares: [], files: new Map() };
const recordKey = (userId: string, entity: string, recordId: string) => `${userId}:${entity}:${recordId}`;
const now = () => new Date().toISOString();

function rowUser(row: Record<string, unknown>): CloudUser {
  return { id: String(row.id), email: String(row.email), passwordHash: String(row.password_hash), emailVerifiedAt: row.email_verified_at ? new Date(String(row.email_verified_at)).toISOString() : undefined, createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString() };
}

export const CloudDatabase = {
  mode: () => hasPostgres() ? "postgres" as const : "memory" as const,

  async createUser(email: string, passwordHash: string, name: string) {
    const id = randomUUID(); const timestamp = now();
    if (!hasPostgres()) {
      if ([...memory.users.values()].some((user) => user.email === email)) throw new Error("EMAIL_EXISTS");
      const user = { id, email, passwordHash, createdAt: timestamp, updatedAt: timestamp } satisfies CloudUser;
      memory.users.set(id, user); memory.profiles.set(id, { userId: id, name, language: "pt-BR", theme: "system", preferences: {}, updatedAt: timestamp });
      return user;
    }
    try {
      const result = await transaction(async (client) => {
        const inserted = await client.query("INSERT INTO users (id,email,password_hash) VALUES ($1,$2,$3) RETURNING *", [id, email, passwordHash]);
        await client.query("INSERT INTO user_profiles (user_id,name) VALUES ($1,$2)", [id, name]);
        return inserted.rows[0] as Record<string, unknown>;
      });
      return rowUser(result);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new Error("EMAIL_EXISTS");
      throw error;
    }
  },

  async userByEmail(email: string) {
    if (!hasPostgres()) return [...memory.users.values()].find((user) => user.email === email);
    const result = await query<Record<string, unknown>>("SELECT * FROM users WHERE email=$1", [email]);
    return result.rows[0] ? rowUser(result.rows[0]) : undefined;
  },
  async userById(id: string) {
    if (!hasPostgres()) return memory.users.get(id);
    const result = await query<Record<string, unknown>>("SELECT * FROM users WHERE id=$1", [id]);
    return result.rows[0] ? rowUser(result.rows[0]) : undefined;
  },
  async updateUser(id: string, changes: { email?: string; passwordHash?: string; verified?: boolean; unverify?: boolean }) {
    if (!hasPostgres()) { const user = memory.users.get(id); if (!user) return; if(changes.email&&[...memory.users.values()].some((item)=>item.id!==id&&item.email===changes.email))throw new Error("EMAIL_EXISTS"); const next = { ...user, email: changes.email ?? user.email, passwordHash: changes.passwordHash ?? user.passwordHash, emailVerifiedAt: changes.unverify ? undefined : changes.verified ? now() : user.emailVerifiedAt, updatedAt: now() }; memory.users.set(id, next); return next; }
    try {
      const result = await query<Record<string, unknown>>("UPDATE users SET email=COALESCE($2,email), password_hash=COALESCE($3,password_hash), email_verified_at=CASE WHEN $4 THEN NOW() WHEN $5 THEN NULL ELSE email_verified_at END, updated_at=NOW() WHERE id=$1 RETURNING *", [id, changes.email ?? null, changes.passwordHash ?? null, changes.verified ?? false, changes.unverify ?? false]);
      return result.rows[0] ? rowUser(result.rows[0]) : undefined;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new Error("EMAIL_EXISTS");
      throw error;
    }
  },
  async profile(userId: string) {
    if (!hasPostgres()) return memory.profiles.get(userId);
    const result = await query<Record<string, unknown>>("SELECT * FROM user_profiles WHERE user_id=$1", [userId]); const row = result.rows[0];
    return row ? { userId: String(row.user_id), name: String(row.name), photoUrl: row.photo_url ? String(row.photo_url) : undefined, language: String(row.language), theme: String(row.theme), preferences: (row.preferences ?? {}) as Record<string, unknown>, updatedAt: new Date(String(row.updated_at)).toISOString() } satisfies UserProfile : undefined;
  },
  async updateProfile(userId: string, changes: Partial<Omit<UserProfile, "userId" | "updatedAt">>) {
    const current = await this.profile(userId); if (!current) throw new Error("PROFILE_NOT_FOUND"); const next = { ...current, ...changes, updatedAt: now() };
    if (!hasPostgres()) { memory.profiles.set(userId, next); return next; }
    await query("UPDATE user_profiles SET name=$2,photo_url=$3,language=$4,theme=$5,preferences=$6,updated_at=NOW() WHERE user_id=$1", [userId, next.name, next.photoUrl ?? null, next.language, next.theme, JSON.stringify(next.preferences)]); return next;
  },

  async saveSession(session: DeviceSession) { if (!hasPostgres()) { memory.sessions.set(session.id, session); return; } await query("INSERT INTO refresh_tokens (id,user_id,token_hash,device_id,device_name,expires_at,last_used_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [session.id, session.userId, session.tokenHash, session.deviceId, session.deviceName, session.expiresAt, session.lastUsedAt]); },
  async sessionByHash(hash: string) { if (!hasPostgres()) return [...memory.sessions.values()].find((item) => item.tokenHash === hash && !item.revokedAt); const result = await query<Record<string, unknown>>("SELECT * FROM refresh_tokens WHERE token_hash=$1 AND revoked_at IS NULL", [hash]); const row = result.rows[0]; return row ? { id: String(row.id), userId: String(row.user_id), tokenHash: String(row.token_hash), deviceId: String(row.device_id), deviceName: String(row.device_name), expiresAt: new Date(String(row.expires_at)).toISOString(), lastUsedAt: new Date(String(row.last_used_at)).toISOString(), revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : undefined } satisfies DeviceSession : undefined; },
  async revokeSession(id: string) { if (!hasPostgres()) { const item = memory.sessions.get(id); if (item) memory.sessions.set(id, { ...item, revokedAt: now() }); return; } await query("UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=$1", [id]); },
  async revokeUserSessions(userId: string) { if (!hasPostgres()) { for (const item of memory.sessions.values()) if (item.userId === userId) memory.sessions.set(item.id, { ...item, revokedAt: now() }); return; } await query("UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1", [userId]); },
  async devices(userId: string) { if (!hasPostgres()) return [...memory.sessions.values()].filter((item) => item.userId === userId && !item.revokedAt); const result = await query<Record<string, unknown>>("SELECT * FROM refresh_tokens WHERE user_id=$1 AND revoked_at IS NULL ORDER BY last_used_at DESC", [userId]); return result.rows.map((row) => ({ id: String(row.id), userId, tokenHash: "", deviceId: String(row.device_id), deviceName: String(row.device_name), expiresAt: new Date(String(row.expires_at)).toISOString(), lastUsedAt: new Date(String(row.last_used_at)).toISOString() })); },

  async saveAccountToken(hash: string, userId: string, type: string, expiresAt: string) { if (!hasPostgres()) { memory.accountTokens.set(hash, { userId, type, expiresAt }); return; } await query("INSERT INTO account_tokens (token_hash,user_id,type,expires_at) VALUES ($1,$2,$3,$4) ON CONFLICT (token_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at", [hash, userId, type, expiresAt]); },
  async consumeAccountToken(hash: string, type: string) { if (!hasPostgres()) { const token = memory.accountTokens.get(hash); if (!token || token.type !== type || token.usedAt || new Date(token.expiresAt) < new Date()) return; token.usedAt = now(); return token.userId; } const result = await query<{ user_id: string }>("UPDATE account_tokens SET used_at=NOW() WHERE token_hash=$1 AND type=$2 AND used_at IS NULL AND expires_at>NOW() RETURNING user_id", [hash, type]); return result.rows[0]?.user_id; },

  async record(userId: string, entity: SyncEntity, recordId: string) { if (!hasPostgres()) return memory.records.get(recordKey(userId, entity, recordId)); const result = await query<Record<string, unknown>>("SELECT * FROM sync_records WHERE user_id=$1 AND entity=$2 AND record_id=$3", [userId, entity, recordId]); const row = result.rows[0]; return row ? { userId, entity, recordId, operation: row.deleted_at ? "delete" : "upsert", data: row.payload, baseVersion: Number(row.version) - 1, version: Number(row.version), updatedAt: new Date(String(row.updated_at)).toISOString(), hash: String(row.hash), deviceId: String(row.device_id) } satisfies CloudRecord : undefined; },
  async writeRecord(record: CloudRecord) {
    if (!hasPostgres()) { memory.records.set(recordKey(record.userId, record.entity, record.recordId), record); const logged = { ...record, sequence: memory.logs.length + 1 }; memory.logs.push(logged); return logged; }
    const tableMap: Partial<Record<SyncEntity, string>> = { documents: "materials", studies: "studies", workspace: "workspace", mentor: "mentor", learning: "learning", knowledge: "knowledge", flashcards: "flashcards", quizzes: "quizzes", summaries: "summaries", notes: "notes" };
    return transaction(async (client) => {
      await client.query("INSERT INTO sync_records (user_id,entity,record_id,payload,version,hash,updated_at,deleted_at,device_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (user_id,entity,record_id) DO UPDATE SET payload=EXCLUDED.payload,version=EXCLUDED.version,hash=EXCLUDED.hash,updated_at=EXCLUDED.updated_at,deleted_at=EXCLUDED.deleted_at,device_id=EXCLUDED.device_id", [record.userId, record.entity, record.recordId, record.data === undefined ? null : JSON.stringify(record.data), record.version, record.hash, record.updatedAt, record.operation === "delete" ? record.updatedAt : null, record.deviceId]);
      const table = tableMap[record.entity]; if (table) await client.query(`INSERT INTO ${table} (user_id,id,payload,version,hash,updated_at,deleted_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id,id) DO UPDATE SET payload=EXCLUDED.payload,version=EXCLUDED.version,hash=EXCLUDED.hash,updated_at=EXCLUDED.updated_at,deleted_at=EXCLUDED.deleted_at`, [record.userId, record.recordId, record.data === undefined ? null : JSON.stringify(record.data), record.version, record.hash, record.updatedAt, record.operation === "delete" ? record.updatedAt : null]);
      const logged = await client.query<{ sequence: string }>("INSERT INTO sync_logs (user_id,entity,record_id,operation,version,hash,device_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING sequence", [record.userId, record.entity, record.recordId, record.operation, record.version, record.hash, record.deviceId]);
      return { ...record, sequence: Number(logged.rows[0].sequence) };
    });
  },
  async changes(userId: string, since: number) { if (!hasPostgres()) return memory.logs.filter((item) => item.userId === userId && (item.sequence ?? 0) > since); const result = await query<Record<string, unknown>>("SELECT l.sequence,r.* FROM sync_logs l JOIN sync_records r ON r.user_id=l.user_id AND r.entity=l.entity AND r.record_id=l.record_id WHERE l.user_id=$1 AND l.sequence>$2 ORDER BY l.sequence ASC LIMIT 2000", [userId, since]); return result.rows.map((row) => ({ userId, entity: String(row.entity) as SyncEntity, recordId: String(row.record_id), operation: row.deleted_at ? "delete" as const : "upsert" as const, data: row.payload, baseVersion: Number(row.version) - 1, version: Number(row.version), updatedAt: new Date(String(row.updated_at)).toISOString(), hash: String(row.hash), deviceId: String(row.device_id), sequence: Number(row.sequence) })); },
  async history(userId:string){if(!hasPostgres())return memory.logs.filter((item)=>item.userId===userId).slice(-100).reverse().map((item)=>({sequence:item.sequence,entity:item.entity,recordId:item.recordId,operation:item.operation,deviceId:item.deviceId,createdAt:item.updatedAt}));const result=await query<Record<string,unknown>>("SELECT sequence,entity,record_id,operation,device_id,created_at FROM sync_logs WHERE user_id=$1 ORDER BY sequence DESC LIMIT 100",[userId]);return result.rows.map((row)=>({sequence:Number(row.sequence),entity:String(row.entity),recordId:String(row.record_id),operation:String(row.operation),deviceId:String(row.device_id),createdAt:new Date(String(row.created_at)).toISOString()}));},
  async allRecords(userId: string) { if (!hasPostgres()) return [...memory.records.values()].filter((item) => item.userId === userId); const result = await query<Record<string, unknown>>("SELECT * FROM sync_records WHERE user_id=$1", [userId]); return result.rows.map((row) => ({ userId, entity: String(row.entity) as SyncEntity, recordId: String(row.record_id), operation: row.deleted_at ? "delete" as const : "upsert" as const, data: row.payload, baseVersion: Number(row.version)-1, version: Number(row.version), updatedAt: new Date(String(row.updated_at)).toISOString(), hash: String(row.hash), deviceId: String(row.device_id) })); },

  async createBackup(userId: string) { const payload = await this.allRecords(userId); const backup = { id: randomUUID(), userId, payload, sizeBytes: Buffer.byteLength(JSON.stringify(payload)), createdAt: now() } satisfies Backup; if (!hasPostgres()) memory.backups.unshift(backup); else await query("INSERT INTO backups (id,user_id,payload,size_bytes,created_at) VALUES ($1,$2,$3,$4,$5)", [backup.id,userId,JSON.stringify(payload),backup.sizeBytes,backup.createdAt]); return backup; },
  async backups(userId: string) { if (!hasPostgres()) return memory.backups.filter((item) => item.userId === userId); const result = await query<Record<string, unknown>>("SELECT * FROM backups WHERE user_id=$1 ORDER BY created_at DESC", [userId]); return result.rows.map((row) => ({ id:String(row.id),userId,payload:row.payload as CloudRecord[],sizeBytes:Number(row.size_bytes),createdAt:new Date(String(row.created_at)).toISOString() })); },
  async backup(userId: string, id: string) { return (await this.backups(userId)).find((item) => item.id === id); },

  async createShare(userId: string, entity: SyncEntity, recordId: string, expiresAt?: string) { const share = { id: randomUUID(), userId, token: `${randomUUID()}${randomUUID()}`.replaceAll("-",""), entity, recordId, expiresAt, createdAt: now() } satisfies Share; if (!hasPostgres()) memory.shares.unshift(share); else await query("INSERT INTO shares (id,user_id,token,entity,record_id,expires_at) VALUES ($1,$2,$3,$4,$5,$6)",[share.id,userId,share.token,entity,recordId,expiresAt??null]); return share; },
  async shares(userId: string) { if (!hasPostgres()) return memory.shares.filter((item) => item.userId === userId && !item.revokedAt); const result=await query<Record<string,unknown>>("SELECT * FROM shares WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC",[userId]); return result.rows.map((row)=>({id:String(row.id),userId,token:String(row.token),entity:String(row.entity) as SyncEntity,recordId:String(row.record_id),expiresAt:row.expires_at?new Date(String(row.expires_at)).toISOString():undefined,createdAt:new Date(String(row.created_at)).toISOString()})); },
  async revokeShare(userId:string,id:string){if(!hasPostgres()){const index=memory.shares.findIndex((item)=>item.userId===userId&&item.id===id);if(index>=0)memory.shares[index]={...memory.shares[index],revokedAt:now()};return;}await query("UPDATE shares SET revoked_at=NOW() WHERE user_id=$1 AND id=$2",[userId,id]);},
  async shareByToken(token: string) { const share = hasPostgres() ? (await query<Record<string,unknown>>("SELECT * FROM shares WHERE token=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>NOW())",[token])).rows[0] : memory.shares.find((item)=>item.token===token&&!item.revokedAt&&(!item.expiresAt||new Date(item.expiresAt)>new Date())); if(!share)return; const normalized = hasPostgres()?{id:String((share as Record<string,unknown>).id),userId:String((share as Record<string,unknown>).user_id),token,entity:String((share as Record<string,unknown>).entity) as SyncEntity,recordId:String((share as Record<string,unknown>).record_id),createdAt:new Date(String((share as Record<string,unknown>).created_at)).toISOString()}:share as Share; return { share: normalized, record: await this.record(normalized.userId,normalized.entity,normalized.recordId) }; },

  async saveFile(userId:string,id:string,name:string,mimeType:string,hash:string,content:Buffer){const item={userId,id,name,mimeType,hash,sizeBytes:content.byteLength,content,updatedAt:now()};if(!hasPostgres()){memory.files.set(`${userId}:${id}`,item);return item;}await query("INSERT INTO files (id,user_id,name,mime_type,hash,size_bytes,content) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id,id) DO UPDATE SET name=EXCLUDED.name,mime_type=EXCLUDED.mime_type,hash=EXCLUDED.hash,size_bytes=EXCLUDED.size_bytes,content=EXCLUDED.content,updated_at=NOW()",[id,userId,name,mimeType,hash,content.byteLength,content]);return item;},
  async file(userId:string,id:string){if(!hasPostgres())return memory.files.get(`${userId}:${id}`);const result=await query<Record<string,unknown>>("SELECT * FROM files WHERE user_id=$1 AND id=$2",[userId,id]);const row=result.rows[0];return row?{userId,id,name:String(row.name),mimeType:String(row.mime_type),hash:String(row.hash),sizeBytes:Number(row.size_bytes),content:row.content as Buffer,updatedAt:new Date(String(row.updated_at)).toISOString()}:undefined;},
};

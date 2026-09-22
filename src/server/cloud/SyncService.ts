import "server-only";
import { CloudDatabase } from "./CloudDatabase";
import { ConflictResolver } from "./ConflictResolver";
import type { CloudRecord, SyncConflict, SyncMutation } from "./types";

export const SyncService = {
  async push(userId: string, mutations: readonly SyncMutation[]) {
    const accepted: CloudRecord[] = []; const conflicts: SyncConflict[] = [];
    for (const mutation of mutations.slice(0, 2_000)) {
      const remote = await CloudDatabase.record(userId, mutation.entity, mutation.recordId);
      const resolution = ConflictResolver.resolve(mutation, remote);
      if (resolution.conflict) { conflicts.push(resolution.conflict); continue; }
      if (!resolution.record || resolution.record === remote) { if (remote) accepted.push(remote); continue; }
      const written = await CloudDatabase.writeRecord({ ...resolution.record, userId }); accepted.push(written);
    }
    return { accepted, conflicts };
  },
  pull(userId: string, since: number) { return CloudDatabase.changes(userId, since); },
  async restore(userId: string, backupId: string, deviceId: string) {
    const backup = await CloudDatabase.backup(userId, backupId);
    if (!backup) throw new Error("Backup não encontrado.");
    const current = await CloudDatabase.allRecords(userId);
    const currentByKey = new Map(current.map((item) => [`${item.entity}:${item.recordId}`, item]));
    const backupKeys = new Set(backup.payload.map((item) => `${item.entity}:${item.recordId}`));
    const restored: CloudRecord[] = [];
    const timestamp = new Date().toISOString();
    for (const item of current) {
      if (backupKeys.has(`${item.entity}:${item.recordId}`) || item.operation === "delete") continue;
      restored.push(await CloudDatabase.writeRecord({ ...item, operation: "delete", data: undefined, deviceId, version: item.version + 1, hash: `deleted:${item.hash}`, updatedAt: timestamp }));
    }
    for (const item of backup.payload) {
      const active = currentByKey.get(`${item.entity}:${item.recordId}`);
      restored.push(await CloudDatabase.writeRecord({ ...item, userId, deviceId, version: (active?.version ?? 0) + 1, updatedAt: timestamp }));
    }
    return restored;
  },
};

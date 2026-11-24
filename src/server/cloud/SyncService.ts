import "server-only";
import { CloudDatabase } from "./CloudDatabase";
import { ConflictResolver } from "./ConflictResolver";
import type { CloudRecord, SyncConflict, SyncMutation } from "./types";

export const SyncService = {
  async push(userId: string, mutations: readonly SyncMutation[]) {
    const accepted: CloudRecord[] = [];
    const conflicts: SyncConflict[] = [];
    for (const mutation of mutations.slice(0, 2_000)) {
      const outcome = await CloudDatabase.applySyncMutation(userId, mutation, ConflictResolver.resolve);
      if (outcome.conflict) {
        conflicts.push(outcome.conflict);
      } else if (outcome.accepted) {
        accepted.push(outcome.accepted);
      }
    }
    return { accepted, conflicts };
  },
  pull(userId: string, since: number) {
    return CloudDatabase.changes(userId, since);
  },
  /**
   * Restaura os registros do usuário em transação única no PostgreSQL.
   * Observação: objetos binários armazenados no Object Storage (S3) são externos
   * à transação do PostgreSQL e não são copiados nem revertidos por backups.payload;
   * a consistência de arquivos binários é mantida separadamente via tabela `files`.
   */
  restore(userId: string, backupId: string, deviceId: string) {
    return CloudDatabase.restoreBackupAtomic(userId, backupId, deviceId);
  },
};

import type { CloudRecord, SyncConflict, SyncMutation } from "./types";

export const ConflictResolver = {
  resolve(local: SyncMutation, remote?: CloudRecord): { record?: CloudRecord; conflict?: SyncConflict } {
    if (!remote) return { record: { ...local, userId: "", version: 1 } };
    if (remote.hash === local.hash) return { record: remote };
    if (local.baseVersion === remote.version) return { record: { ...local, userId: remote.userId, version: remote.version + 1 } };
    if (local.operation === "delete" && new Date(local.updatedAt) > new Date(remote.updatedAt)) return { record: { ...local, userId: remote.userId, version: remote.version + 1 } };
    return { conflict: { id: `${local.entity}:${local.recordId}:${remote.version}`, entity: local.entity, recordId: local.recordId, local, remote, reason: "O mesmo registro foi alterado em outro dispositivo." } };
  },
};


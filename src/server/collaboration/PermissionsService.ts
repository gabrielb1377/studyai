import "server-only";
import type { CollaborationRole } from "@/features/collaboration/types";

export type CollaborationAction = "read" | "comment" | "edit" | "manage-members" | "delete-room";

const permissions: Record<CollaborationRole, readonly CollaborationAction[]> = {
  admin: ["read", "comment", "edit", "manage-members", "delete-room"],
  editor: ["read", "comment", "edit"],
  commenter: ["read", "comment"],
  reader: ["read"],
};

export const PermissionsService = {
  can(role: CollaborationRole, action: CollaborationAction) {
    return permissions[role].includes(action);
  },
  assert(role: CollaborationRole | undefined, action: CollaborationAction) {
    if (!role || !this.can(role, action)) {
      throw new Response(JSON.stringify({ error: "Você não possui permissão para esta ação." }), {
        status: role ? 403 : 404,
        headers: { "content-type": "application/json" },
      });
    }
  },
};

import "server-only";
import { CollaborationService } from "./CollaborationService";

export const WorkspaceShareService = {
  share(roomId: string, userId: string, input: { title?: unknown; recordId?: unknown; data?: unknown }) {
    return CollaborationService.saveResource(roomId, userId, { ...input, type: "workspace" });
  },
};

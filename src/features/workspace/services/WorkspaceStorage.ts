import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { workspaceCurrentStudyKey, type ExpectedWorkspaceSession } from "@/features/study/services/WorkspacePersistence";
import { LayoutManager } from "./LayoutManager";
import { WorkspaceState } from "./WorkspaceState";
import type { WorkspaceLayout, WorkspaceRuntimeState } from "../types";

export const WORKSPACE_V2_KEY_PREFIX = "studyai:workspace-v2:u:";
export const WORKSPACE_LAYOUTS_KEY_PREFIX = "studyai:workspace-layouts:v2:u:";

function sanitizeOwnerSegment(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function workspaceV2Key(userId: string, studyId: string): string {
  return `${WORKSPACE_V2_KEY_PREFIX}${sanitizeOwnerSegment(userId)}:${studyId}`;
}

export function workspaceLayoutsKey(userId: string): string {
  return `${WORKSPACE_LAYOUTS_KEY_PREFIX}${sanitizeOwnerSegment(userId)}`;
}

function activeSessionUser(expected?: ExpectedWorkspaceSession): string | null {
  if (typeof window === "undefined") return null;
  const session = SessionOperationManager.current();
  if (session.suspended || !session.userId) return null;
  if (expected) {
    if (session.userId !== expected.userId) return null;
    if (expected.generation !== undefined && session.generation !== expected.generation) return null;
  }
  return session.userId;
}

function isState(value: unknown): value is WorkspaceRuntimeState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<WorkspaceRuntimeState>;
  return state.version === 2 && typeof state.studyId === "string" && Array.isArray(state.panels);
}

export const WorkspaceStorage = {
  load(studyId: string, expected?: ExpectedWorkspaceSession) {
    const userId = activeSessionUser(expected);
    if (!userId) return WorkspaceState.create(studyId);
    try {
      // Nunca lê nem migra automaticamente a chave global legada `studyai:workspace-v2:<studyId>`.
      const parsed: unknown = JSON.parse(
        localStorage.getItem(workspaceV2Key(userId, studyId)) ?? "null",
      );
      if (parsed && typeof parsed === "object" && "ownerId" in parsed && (parsed as { ownerId?: unknown }).ownerId !== userId) {
        return WorkspaceState.create(studyId);
      }
      return isState(parsed) ? parsed : WorkspaceState.create(studyId);
    } catch {
      return WorkspaceState.create(studyId);
    }
  },

  save(state: WorkspaceRuntimeState, expected?: ExpectedWorkspaceSession) {
    const userId = activeSessionUser(expected);
    const next = { ...state, updatedAt: new Date().toISOString() };
    if (!userId) return next;
    // Revalida imediatamente antes da gravação efetiva
    if (activeSessionUser(expected) !== userId) return next;
    try {
      localStorage.setItem(
        workspaceV2Key(userId, state.studyId),
        JSON.stringify({ ...next, ownerId: userId }),
      );
      localStorage.setItem(workspaceCurrentStudyKey(userId), state.studyId);
    } catch {
      return next;
    }
    window.dispatchEvent(new Event("studyai:workspace-v2-updated"));
    return next;
  },

  loadLayouts(expected?: ExpectedWorkspaceSession): WorkspaceLayout[] {
    const userId = activeSessionUser(expected);
    if (!userId) return LayoutManager.builtIn;
    try {
      // Nunca lê nem migra automaticamente a chave global legada `studyai:workspace-layouts:v2`.
      const custom: unknown = JSON.parse(localStorage.getItem(workspaceLayoutsKey(userId)) ?? "[]");
      return [
        ...LayoutManager.builtIn,
        ...(Array.isArray(custom)
          ? (custom.filter((layout) => layout && typeof layout === "object") as WorkspaceLayout[])
          : []),
      ];
    } catch {
      return LayoutManager.builtIn;
    }
  },

  saveCustomLayout(layout: WorkspaceLayout, expected?: ExpectedWorkspaceSession) {
    const userId = activeSessionUser(expected);
    if (!userId) return;
    const custom = this.loadLayouts(expected).filter((item) => !item.builtIn && item.id !== layout.id);
    if (activeSessionUser(expected) !== userId) return;
    try {
      localStorage.setItem(workspaceLayoutsKey(userId), JSON.stringify([...custom, layout]));
    } catch {
      return;
    }
    window.dispatchEvent(new Event("studyai:workspace-layouts-updated"));
  },

  removeCustomLayout(layoutId: string, expected?: ExpectedWorkspaceSession) {
    const userId = activeSessionUser(expected);
    if (!userId) return;
    const custom = this.loadLayouts(expected).filter((item) => !item.builtIn && item.id !== layoutId);
    if (activeSessionUser(expected) !== userId) return;
    try {
      localStorage.setItem(workspaceLayoutsKey(userId), JSON.stringify(custom));
    } catch {
      return;
    }
    window.dispatchEvent(new Event("studyai:workspace-layouts-updated"));
  },
};

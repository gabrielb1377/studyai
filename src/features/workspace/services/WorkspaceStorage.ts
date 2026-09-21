import { LayoutManager } from "./LayoutManager";
import { WorkspaceState } from "./WorkspaceState";
import type { WorkspaceLayout, WorkspaceRuntimeState } from "../types";

const PREFIX = "studyai:workspace-v2:";
const LAYOUTS_KEY = "studyai:workspace-layouts:v2";

function isState(value: unknown): value is WorkspaceRuntimeState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<WorkspaceRuntimeState>;
  return state.version === 2 && typeof state.studyId === "string" && Array.isArray(state.panels);
}

export const WorkspaceStorage = {
  load(studyId: string) {
    if (typeof window === "undefined") return WorkspaceState.create(studyId);
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(`${PREFIX}${studyId}`) ?? "null");
      return isState(parsed) ? parsed : WorkspaceState.create(studyId);
    } catch {
      return WorkspaceState.create(studyId);
    }
  },

  save(state: WorkspaceRuntimeState) {
    const next = { ...state, updatedAt: new Date().toISOString() };
    localStorage.setItem(`${PREFIX}${state.studyId}`, JSON.stringify(next));
    localStorage.setItem("studyai:workspace-current", state.studyId);
    window.dispatchEvent(new Event("studyai:workspace-v2-updated"));
    return next;
  },

  loadLayouts(): WorkspaceLayout[] {
    if (typeof window === "undefined") return LayoutManager.builtIn;
    try {
      const custom: unknown = JSON.parse(localStorage.getItem(LAYOUTS_KEY) ?? "[]");
      return [...LayoutManager.builtIn, ...(Array.isArray(custom) ? custom.filter((layout) => layout && typeof layout === "object") as WorkspaceLayout[] : [])];
    } catch {
      return LayoutManager.builtIn;
    }
  },

  saveCustomLayout(layout: WorkspaceLayout) {
    const custom = this.loadLayouts().filter((item) => !item.builtIn && item.id !== layout.id);
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify([...custom, layout]));
    window.dispatchEvent(new Event("studyai:workspace-layouts-updated"));
  },

  removeCustomLayout(layoutId: string) {
    const custom = this.loadLayouts().filter((item) => !item.builtIn && item.id !== layoutId);
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(custom));
    window.dispatchEvent(new Event("studyai:workspace-layouts-updated"));
  },
};

import { LayoutManager } from "./LayoutManager";
import { PanelManager } from "./PanelManager";
import { WorkspaceStorage } from "./WorkspaceStorage";
import type { WorkspacePanelType, WorkspaceRuntimeState } from "../types";

export const WorkspaceManager = {
  load: WorkspaceStorage.load,

  save(state: WorkspaceRuntimeState) {
    return WorkspaceStorage.save(state);
  },

  applyLayout(state: WorkspaceRuntimeState, layoutId: string) {
    const layout = WorkspaceStorage.loadLayouts().find((item) => item.id === layoutId) ?? LayoutManager.builtIn[0];
    const panels = LayoutManager.instantiate(layout);
    return this.save({ ...state, layoutId: layout.id, panels, activePanelId: panels[0]?.id });
  },

  openTool(state: WorkspaceRuntimeState, type: WorkspacePanelType, resourceId?: string, forceNew = false) {
    const existing = state.panels.find((panel) => panel.type === type && (!resourceId || !panel.resourceId || panel.resourceId === resourceId));
    if (existing && !forceNew) {
      const panels = PanelManager.patch(state.panels, existing.id, { minimized: false, resourceId: resourceId ?? existing.resourceId });
      return this.save({ ...state, panels, activePanelId: existing.id });
    }
    const panels = PanelManager.add(state.panels, type, resourceId);
    return this.save({ ...state, panels, activePanelId: panels.at(-1)?.id });
  },
};

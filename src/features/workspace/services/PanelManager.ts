import { WorkspaceState } from "./WorkspaceState";
import type { WorkspacePanel, WorkspacePanelType } from "../types";

const MIN_SIZE = 18;
const MAX_PANELS = 6;

function rebalance(panels: WorkspacePanel[]) {
  const visible = panels.filter((panel) => !panel.minimized);
  const total = visible.reduce((sum, panel) => sum + panel.size, 0) || 1;
  return panels.map((panel) => panel.minimized ? panel : { ...panel, size: Math.round((panel.size / total) * 1000) / 10 });
}

export const PanelManager = {
  add(panels: readonly WorkspacePanel[], type: WorkspacePanelType, resourceId?: string) {
    if (panels.length >= MAX_PANELS) return [...panels];
    const size = 100 / (panels.filter((panel) => !panel.minimized).length + 1);
    return rebalance([...panels.map((panel) => ({ ...panel, size })), WorkspaceState.createPanel(type, size, resourceId)]);
  },

  remove(panels: readonly WorkspacePanel[], panelId: string) {
    const next = panels.filter((panel) => panel.id !== panelId);
    return rebalance(next.length ? next : [WorkspaceState.createPanel("material", 100)]);
  },

  minimize(panels: readonly WorkspacePanel[], panelId: string) {
    return rebalance(panels.map((panel) => panel.id === panelId ? { ...panel, minimized: !panel.minimized, maximized: false } : panel));
  },

  maximize(panels: readonly WorkspacePanel[], panelId: string) {
    const target = panels.find((panel) => panel.id === panelId);
    const maximize = !target?.maximized;
    return panels.map((panel) => panel.id === panelId
      ? maximize
        ? { ...panel, maximized: true, minimized: false, restoreSize: panel.size, size: 100 }
        : { ...panel, maximized: false, size: panel.restoreSize ?? panel.size, restoreSize: undefined }
      : panel.maximized
        ? { ...panel, maximized: false, size: panel.restoreSize ?? panel.size, restoreSize: undefined }
        : { ...panel, maximized: false });
  },

  resize(panels: readonly WorkspacePanel[], leftId: string, rightId: string, deltaPercent: number) {
    const left = panels.find((panel) => panel.id === leftId);
    const right = panels.find((panel) => panel.id === rightId);
    if (!left || !right || left.minimized || right.minimized) return [...panels];
    const delta = Math.max(MIN_SIZE - left.size, Math.min(right.size - MIN_SIZE, deltaPercent));
    return panels.map((panel) => panel.id === leftId
      ? { ...panel, size: Math.round((panel.size + delta) * 10) / 10 }
      : panel.id === rightId
        ? { ...panel, size: Math.round((panel.size - delta) * 10) / 10 }
        : panel);
  },

  patch(panels: readonly WorkspacePanel[], panelId: string, changes: Partial<WorkspacePanel>) {
    return panels.map((panel) => panel.id === panelId ? { ...panel, ...changes } : panel);
  },
};

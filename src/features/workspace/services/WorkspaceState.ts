import type { WorkspacePanel, WorkspacePanelType, WorkspaceRuntimeState } from "../types";

const panelTitles: Record<WorkspacePanelType, string> = {
  material: "Material",
  tutor: "Tutor IA",
  mentor: "Mentor",
  summaries: "Resumos",
  flashcards: "Flashcards",
  quiz: "Quiz",
  notes: "Notas",
  knowledge: "Mapa de Conhecimento",
  dashboard: "Dashboard do tema",
};

export const WorkspaceState = {
  panelTitle(type: WorkspacePanelType) {
    return panelTitles[type];
  },

  createPanel(type: WorkspacePanelType, size = 50, resourceId?: string): WorkspacePanel {
    const now = new Date().toISOString();
    return {
      id: `panel-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      title: panelTitles[type],
      size,
      minimized: false,
      maximized: false,
      resourceId,
      scrollTop: 0,
      createdAt: now,
    };
  },

  create(studyId: string, panels?: WorkspacePanel[]): WorkspaceRuntimeState {
    const nextPanels = panels?.length ? panels : [this.createPanel("material", 65), this.createPanel("tutor", 35)];
    return {
      version: 2,
      studyId,
      layoutId: "reading",
      panels: nextPanels,
      activePanelId: nextPanels[0]?.id,
      filters: {},
      updatedAt: new Date().toISOString(),
    };
  },
};

import { WorkspaceState } from "./WorkspaceState";
import type { WorkspaceLayout, WorkspacePanel } from "../types";

const now = "2026-09-21T00:00:00.000Z";

export const BUILT_IN_LAYOUTS: WorkspaceLayout[] = [
  { id: "reading", name: "Leitura", builtIn: true, panels: [{ type: "material", title: "Material", size: 65 }, { type: "tutor", title: "Tutor IA", size: 35 }], createdAt: now, updatedAt: now },
  { id: "review", name: "Revisão", builtIn: true, panels: [{ type: "flashcards", title: "Flashcards", size: 50 }, { type: "notes", title: "Notas", size: 50 }], createdAt: now, updatedAt: now },
  { id: "exercises", name: "Exercícios", builtIn: true, panels: [{ type: "quiz", title: "Quiz", size: 62 }, { type: "tutor", title: "Tutor IA", size: 38 }], createdAt: now, updatedAt: now },
  { id: "tutor", name: "Tutor", builtIn: true, panels: [{ type: "tutor", title: "Tutor IA", size: 60 }, { type: "knowledge", title: "Mapa de Conhecimento", size: 40 }], createdAt: now, updatedAt: now },
  { id: "mentor", name: "Mentor", builtIn: true, panels: [{ type: "mentor", title: "Mentor", size: 58 }, { type: "material", title: "Material", size: 42 }], createdAt: now, updatedAt: now },
  { id: "planning", name: "Planejamento", builtIn: true, panels: [{ type: "dashboard", title: "Dashboard do tema", size: 45 }, { type: "notes", title: "Notas", size: 55 }], createdAt: now, updatedAt: now },
  { id: "laboratory", name: "Laboratório", builtIn: true, panels: [{ type: "material", title: "Material", size: 25 }, { type: "lab", title: "Laboratório", size: 25 }, { type: "tutor", title: "Professor", size: 25 }, { type: "notes", title: "Notas", size: 25 }], createdAt: now, updatedAt: now },
  { id: "academy", name: "Academy", builtIn: true, panels: [{ type: "material", title: "Material Academy", size: 45 }, { type: "tutor", title: "Professor", size: 32 }, { type: "notes", title: "Notas", size: 23 }], createdAt: now, updatedAt: now },
  { id: "lab-practice", name: "Prática no Lab", builtIn: true, panels: [{ type: "lab", title: "Laboratório", size: 45 }, { type: "tutor", title: "Professor", size: 30 }, { type: "material", title: "Material", size: 25 }], createdAt: now, updatedAt: now },
  { id: "generated-review", name: "Revisão gerada", builtIn: true, panels: [{ type: "material", title: "PDF Gerado", size: 46 }, { type: "quiz", title: "Quiz", size: 27 }, { type: "flashcards", title: "Flashcards", size: 27 }], createdAt: now, updatedAt: now },
  { id: "learning-path", name: "Trilha guiada", builtIn: true, panels: [{ type: "material", title: "Trilha", size: 42 }, { type: "mentor", title: "Mentor", size: 33 }, { type: "dashboard", title: "Plano do dia", size: 25 }], createdAt: now, updatedAt: now },
];

function normalizeSizes(panels: WorkspacePanel[]) {
  const total = panels.reduce((sum, panel) => sum + panel.size, 0) || 1;
  return panels.map((panel) => ({ ...panel, size: Math.round((panel.size / total) * 1000) / 10 }));
}

export const LayoutManager = {
  builtIn: BUILT_IN_LAYOUTS,

  instantiate(layout: WorkspaceLayout) {
    return normalizeSizes(layout.panels.map((panel) => WorkspaceState.createPanel(panel.type, panel.size)));
  },

  createCustom(name: string, panels: readonly WorkspacePanel[]): WorkspaceLayout {
    const timestamp = new Date().toISOString();
    return {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || "Layout personalizado",
      builtIn: false,
      panels: panels.filter((panel) => !panel.minimized).map(({ type, title, size }) => ({ type, title, size })),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  },
};

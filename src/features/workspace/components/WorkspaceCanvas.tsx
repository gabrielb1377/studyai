"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { Flashcard } from "@/types/flashcard";
import type { QuizResult } from "@/types/quiz";
import type { StudyMaterial } from "@/types/study";
import type { StudyRecord, StudyStatus } from "@/types/study-engine";
import { LayoutManager } from "../services/LayoutManager";
import { PanelManager } from "../services/PanelManager";
import { WorkspaceManager } from "../services/WorkspaceManager";
import { WorkspaceStorage } from "../services/WorkspaceStorage";
import { workspacePanelTypes, type WorkspacePanelType, type WorkspaceRuntimeState } from "../types";
import { useWorkspaceSession } from "../useWorkspaceSession";
import { WorkspacePanelContent } from "./WorkspacePanelContent";
import { WorkspacePanelFrame } from "./WorkspacePanelFrame";
import { WorkspaceToolbar } from "./WorkspaceToolbar";
import { WorkspacePersistence, type WorkspaceTab } from "@/features/study/services/WorkspacePersistence";

const tabToPanel: Record<WorkspaceTab, WorkspacePanelType> = {
  material: "material",
  ia: "tutor",
  knowledge: "knowledge",
  flashcards: "flashcards",
  quiz: "quiz",
  notes: "notes",
};

const panelToTab: Partial<Record<WorkspacePanelType, WorkspaceTab>> = {
  material: "material",
  tutor: "ia",
  knowledge: "knowledge",
  flashcards: "flashcards",
  quiz: "quiz",
  notes: "notes",
};

export function WorkspaceCanvas({ study, materials, requestedMaterialId, requestedTab, flashcards, quizzes, onMaterialChange, onProgressChange, onStatusChange }: {
  study: StudyRecord;
  materials: readonly StudyMaterial[];
  requestedMaterialId?: string;
  requestedTab?: string;
  flashcards: readonly Flashcard[];
  quizzes: readonly QuizResult[];
  onMaterialChange: (materialId: string) => void;
  onProgressChange: (progress: number) => void;
  onStatusChange: (status: StudyStatus) => void;
}) {
  const [state, setState] = useState<WorkspaceRuntimeState>();
  const [layouts, setLayouts] = useState(() => LayoutManager.builtIn);
  const stateRef = useRef<WorkspaceRuntimeState | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let next = WorkspaceManager.load(study.studyId);
    const requestedType = requestedTab && workspacePanelTypes.includes(requestedTab as WorkspacePanelType)
      ? requestedTab as WorkspacePanelType
      : requestedTab && requestedTab in tabToPanel
        ? tabToPanel[requestedTab as WorkspaceTab]
        : undefined;
    if (requestedType) {
      next = WorkspaceManager.openTool(next, requestedType, requestedType === "material" ? requestedMaterialId : undefined);
      const target = next.panels.find((panel) => panel.id === next.activePanelId);
      if (target && !target.maximized) next = { ...next, panels: PanelManager.maximize(next.panels, target.id) };
    }
    if (requestedMaterialId) {
      const materialPanel = next.panels.find((panel) => panel.type === "material");
      if (materialPanel) next = { ...next, panels: PanelManager.patch(next.panels, materialPanel.id, { resourceId: requestedMaterialId }) };
    }
    stateRef.current = next;
    setState(next);
    setLayouts(WorkspaceStorage.loadLayouts());
  }, [requestedMaterialId, requestedTab, study.studyId]);

  const update = useCallback((updater: (current: WorkspaceRuntimeState) => WorkspaceRuntimeState) => {
    setState((current) => {
      if (!current) return current;
      const next = WorkspaceManager.save(updater(current));
      stateRef.current = next;
      return next;
    });
  }, []);

  const openTool = useCallback((type: WorkspacePanelType, forceNew = false) => {
    update((current) => {
      const next = WorkspaceManager.openTool(current, type, type === "material" ? requestedMaterialId ?? materials[0]?.id : undefined, forceNew);
      if (forceNew) return next;
      const target = next.panels.find((panel) => panel.id === next.activePanelId);
      return target && !target.maximized ? { ...next, panels: PanelManager.maximize(next.panels, target.id) } : next;
    });
    const tab = panelToTab[type];
    if (tab) WorkspacePersistence.save(study.studyId, { activeTab: tab });
  }, [materials, requestedMaterialId, study.studyId, update]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: WorkspacePanelType; resourceId?: string }>).detail;
      if (!detail?.type) return;
      update((current) => {
        const next = WorkspaceManager.openTool(current, detail.type!, detail.resourceId);
        const target = next.panels.find((panel) => panel.id === next.activePanelId);
        return target && !target.maximized ? { ...next, panels: PanelManager.maximize(next.panels, target.id) } : next;
      });
    };
    window.addEventListener("studyai:workspace-open", handler);
    return () => window.removeEventListener("studyai:workspace-open", handler);
  }, [update]);

  const tools = useMemo(() => state?.panels.filter((panel) => !panel.minimized).map((panel) => panel.type) ?? [], [state?.panels]);
  const fileIds = useMemo(() => state?.panels.filter((panel) => panel.type === "material" && panel.resourceId).map((panel) => panel.resourceId!) ?? [], [state?.panels]);
  const session = useWorkspaceSession(study.studyId, fileIds, tools);

  if (!state) return <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Restaurando Workspace…</p>;
  const maximized = state.panels.find((panel) => panel.maximized);
  const visiblePanels = maximized ? [maximized] : state.panels;
  const activeTool = state.panels.find((panel) => panel.id === state.activePanelId)?.type;

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>, leftId: string, rightId: string) => {
    event.preventDefault();
    const startX = event.clientX;
    const width = containerRef.current?.getBoundingClientRect().width ?? 1;
    const initial = stateRef.current;
    if (!initial) return;
    const move = (pointer: PointerEvent) => {
      const delta = ((pointer.clientX - startX) / width) * 100;
      setState({ ...initial, panels: PanelManager.resize(initial.panels, leftId, rightId, delta), updatedAt: new Date().toISOString() });
    };
    const end = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      setState((current) => {
        if (!current) return current;
        const saved = WorkspaceManager.save(current);
        stateRef.current = saved;
        return saved;
      });
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end, { once: true });
  };

  return (
    <div className="space-y-4">
      <WorkspaceToolbar
        layouts={layouts}
        activeLayoutId={state.layoutId}
        activeTool={activeTool}
        session={session.session}
        progress={study.progress}
        status={study.status}
        onApplyLayout={(layoutId) => update((current) => WorkspaceManager.applyLayout(current, layoutId))}
        onOpenTool={openTool}
        onNewPanel={(type) => openTool(type, true)}
        onSaveLayout={(name) => {
          const layout = LayoutManager.createCustom(name, state.panels);
          WorkspaceStorage.saveCustomLayout(layout);
          setLayouts(WorkspaceStorage.loadLayouts());
          update((current) => ({ ...current, layoutId: layout.id }));
        }}
        onDeleteLayout={(layoutId) => {
          WorkspaceStorage.removeCustomLayout(layoutId);
          setLayouts(WorkspaceStorage.loadLayouts());
          update((current) => WorkspaceManager.applyLayout(current, "reading"));
        }}
        onPauseSession={() => { void session.pause(); }}
        onResumeSession={() => { void session.resume(); }}
        onFinishSession={() => { void session.finish(); }}
        onProgressChange={onProgressChange}
        onStatusChange={onStatusChange}
      />
      <div ref={containerRef} className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-stretch" aria-label="Painéis do Workspace">
        {visiblePanels.map((panel, index) => {
          const next = visiblePanels[index + 1];
          return <div key={panel.id} className="contents"><div style={{ "--panel-size": panel.minimized ? "4rem" : `${panel.size}%` } as CSSProperties} className="min-w-0 basis-full lg:basis-[var(--panel-size)] lg:shrink-0"><WorkspacePanelFrame panel={panel} onActivate={() => update((current) => ({ ...current, activePanelId: panel.id }))} onMinimize={() => update((current) => ({ ...current, panels: PanelManager.minimize(current.panels, panel.id), activePanelId: panel.id }))} onMaximize={() => update((current) => ({ ...current, panels: PanelManager.maximize(current.panels, panel.id), activePanelId: panel.id }))} onClose={() => update((current) => { const panels = PanelManager.remove(current.panels, panel.id); return { ...current, panels, activePanelId: panels[0]?.id }; })} onScrollChange={(scrollTop) => update((current) => ({ ...current, panels: PanelManager.patch(current.panels, panel.id, { scrollTop }) }))}>
            <WorkspacePanelContent panel={panel} study={study} materials={materials} flashcards={flashcards} quizzes={quizzes} onMaterialChange={(materialId) => { update((current) => ({ ...current, panels: PanelManager.patch(current.panels, panel.id, { resourceId: materialId, title: materials.find((material) => material.id === materialId)?.name ?? panel.title }), activePanelId: panel.id })); onMaterialChange(materialId); }} onProgressChange={onProgressChange} onStatusChange={onStatusChange} />
          </WorkspacePanelFrame></div>{next && !maximized && !panel.minimized && !next.minimized && <div role="separator" aria-label={`Redimensionar painéis ${panel.title} e ${next.title}`} aria-orientation="vertical" tabIndex={0} className="hidden w-1 shrink-0 cursor-col-resize rounded-full bg-border transition-colors hover:bg-primary/60 focus:bg-primary focus:outline-none lg:block" onPointerDown={(event) => beginResize(event, panel.id, next.id)} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); update((current) => ({ ...current, panels: PanelManager.resize(current.panels, panel.id, next.id, event.key === "ArrowRight" ? 2 : -2) })); }} />}</div>;
        })}
      </div>
    </div>
  );
}

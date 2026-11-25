"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  BrainCircuit,
  ClipboardCheck,
  EyeOff,
  FileText,
  FlaskConical,
  Focus,
  Gauge,
  GraduationCap,
  LayoutGrid,
  Network,
  NotebookPen,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  ScanText,
  SearchCheck,
  Sparkles,
  Square,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useExperiencePreferences } from "@/features/preferences/ExperiencePreferences";
import type { StudyStatus } from "@/types/study-engine";
import { computeSessionTimings } from "../services/SessionTracker";
import type { WorkspaceLayout, WorkspacePanelType, WorkspaceStudySession } from "../types";

const tools: Array<{ type: WorkspacePanelType; label: string; icon: typeof BookOpen }> = [
  { type: "material", label: "Material", icon: BookOpen },
  { type: "tutor", label: "IA", icon: Bot },
  { type: "mentor", label: "Mentor", icon: GraduationCap },
  { type: "knowledge", label: "Mapa", icon: Network },
  { type: "flashcards", label: "Flashcards", icon: BrainCircuit },
  { type: "quiz", label: "Quiz", icon: ClipboardCheck },
  { type: "notes", label: "Notas", icon: NotebookPen },
  { type: "review", label: "Revisão", icon: ScanText },
  { type: "ai-quality", label: "IA Quality", icon: SearchCheck },
  { type: "lab", label: "Lab", icon: FlaskConical },
  { type: "summaries", label: "Resumos", icon: FileText },
  { type: "dashboard", label: "Dashboard", icon: Gauge },
];

function formatSeconds(value = 0) {
  const safe = Math.max(0, Math.floor(value));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60).toString().padStart(2, "0");
  const seconds = Math.floor(safe % 60).toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

export function WorkspaceToolbar({
  layouts,
  activeLayoutId,
  activeTool,
  currentStudyId,
  studyTitle,
  studySubject,
  session,
  pendingRecovery = [],
  progress,
  status,
  onApplyLayout,
  onOpenTool,
  onNewPanel,
  onSaveLayout,
  onDeleteLayout,
  onEnterFocusMode,
  onExitFocusMode,
  onUpdateGoalLabel,
  onPauseSession,
  onResumeSession,
  onFinishSession,
  onCancelSession,
  onResumeRecovered,
  onCompleteRecoveredAndStart,
  onDiscardRecoveredAndStart,
  onProgressChange,
  onStatusChange,
}: {
  layouts: readonly WorkspaceLayout[];
  activeLayoutId: string;
  activeTool?: WorkspacePanelType;
  currentStudyId: string;
  studyTitle: string;
  studySubject: string;
  session?: WorkspaceStudySession;
  pendingRecovery?: readonly WorkspaceStudySession[];
  progress: number;
  status: StudyStatus;
  onApplyLayout: (layoutId: string) => void;
  onOpenTool: (type: WorkspacePanelType) => void;
  onNewPanel: (type: WorkspacePanelType) => void;
  onSaveLayout: (name: string) => void;
  onDeleteLayout: (layoutId: string) => void;
  onEnterFocusMode: (goalLabel?: string) => void;
  onExitFocusMode: () => void;
  onUpdateGoalLabel: (goalLabel: string) => void;
  onPauseSession: () => void;
  onResumeSession: () => void;
  onFinishSession: () => void;
  onCancelSession: () => void;
  onResumeRecovered: (sessionId: string) => void;
  onCompleteRecoveredAndStart: () => void;
  onDiscardRecoveredAndStart: () => void;
  onProgressChange: (progress: number) => void;
  onStatusChange: (status: StudyStatus) => void;
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [layoutName, setLayoutName] = useState("");
  const [goalDraft, setGoalDraft] = useState(session?.goalLabel ?? "");
  const experience = useExperiencePreferences();
  const visibleTools =
    experience.mode === "advanced"
      ? tools
      : tools.filter((tool) => tool.type !== "knowledge" && tool.type !== "dashboard");
  const custom = layouts.find((layout) => layout.id === activeLayoutId && !layout.builtIn);
  const inFocusMode = Boolean(session?.focusMode && session.status !== "completed" && session.status !== "cancelled");

  useEffect(() => {
    setGoalDraft(session?.goalLabel ?? "");
  }, [session?.id, session?.goalLabel]);

  return (
    <div className="sticky top-16 z-10 space-y-3 rounded-2xl border bg-card/88 p-3 shadow-[var(--shadow-card)] backdrop-blur-xl lg:static">
      {pendingRecovery.length > 0 ? (
        <section
          aria-label="Recuperação de sessão anterior"
          className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">
                {pendingRecovery.length > 1
                  ? "Múltiplas sessões pendentes encontradas"
                  : "Sessão anterior não finalizada encontrada"}
              </p>
              <p className="text-muted-foreground">
                Escolha como deseja prosseguir para evitar duplicação ou contagem incorreta.
              </p>
            </div>
          </div>

          <ul className="space-y-1.5">
            {pendingRecovery.map((item) => {
              const timings = computeSessionTimings(item);
              const sameStudy = item.studyId === currentStudyId;
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background/80 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {item.studyTitle ?? "Estudo"}
                      {item.subject ? ` · ${item.subject}` : ""}
                    </p>
                    <p className="text-muted-foreground">
                      {item.origin === "focus" ? "Modo Foco" : "Workspace"} · {formatSeconds(timings.focusSeconds)} ·{" "}
                      {item.status === "paused" ? "Pausada" : "Em andamento"}
                    </p>
                  </div>
                  {sameStudy ? (
                    <Button type="button" size="sm" onClick={() => onResumeRecovered(item.id)}>
                      <RotateCcw className="size-3.5" />
                      Retomar sessão
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/estudo?tema=${encodeURIComponent(item.studyId)}`}>Abrir estudo da sessão</Link>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onCompleteRecoveredAndStart}>
              Salvar anterior e iniciar nova
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onDiscardRecoveredAndStart}>
              Descartar e iniciar nova
            </Button>
          </div>
        </section>
      ) : null}

      {inFocusMode ? (
        <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={session?.status === "paused" ? "secondary" : "default"} className="gap-1">
                  <Focus className="size-3" aria-hidden="true" />
                  {session?.status === "paused" ? "Sessão pausada" : "Modo foco ativo"}
                </Badge>
                <span className="truncate text-xs font-medium text-muted-foreground">
                  {studySubject} · {studyTitle}
                </span>
              </div>
              {session?.goalLabel ? (
                <p className="truncate text-xs text-foreground">Objetivo: {session.goalLabel}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className="min-w-16 rounded-lg border bg-background px-2.5 py-1 text-center text-sm font-semibold tabular-nums"
                aria-label="Tempo de foco"
              >
                {formatSeconds(session?.focusSeconds)}
              </span>

              {session?.status === "paused" ? (
                <Button type="button" size="sm" aria-label="Continuar sessão" onClick={onResumeSession}>
                  <Play className="size-3.5" />
                  Retomar
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" aria-label="Pausar sessão" onClick={onPauseSession}>
                  <Pause className="size-3.5" />
                  Pausar
                </Button>
              )}

              <Button type="button" size="sm" aria-label="Encerrar sessão de estudo" onClick={onFinishSession}>
                <Square className="size-3.5" />
                Finalizar
              </Button>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Cancelar sessão de foco"
                onClick={onCancelSession}
              >
                <XCircle className="size-3.5" />
                Cancelar
              </Button>

              <Button type="button" size="sm" variant="outline" onClick={onExitFocusMode}>
                <EyeOff className="size-3.5" />
                Sair do modo foco
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Objetivo da sessão de foco"
              value={goalDraft}
              maxLength={180}
              onChange={(event) => setGoalDraft(event.target.value)}
              onBlur={() => {
                if ((goalDraft.trim() || "") !== (session?.goalLabel ?? "")) {
                  onUpdateGoalLabel(goalDraft);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onUpdateGoalLabel(goalDraft);
                }
              }}
              placeholder="Objetivo da sessão (opcional, ex.: Resolver lista 2)"
              className="h-8 max-w-md bg-background text-xs"
            />
            {goalDraft.trim() !== (session?.goalLabel ?? "") ? (
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => onUpdateGoalLabel(goalDraft)}>
                Definir objetivo
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <LayoutGrid className="size-4 text-primary" />
          <label className="sr-only" htmlFor="workspace-layout">
            Layout do Workspace
          </label>
          <select
            id="workspace-layout"
            aria-label="Layout do Workspace"
            value={activeLayoutId}
            onChange={(event) => onApplyLayout(event.target.value)}
            className="h-9 max-w-44 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {layouts.map((layout) => (
              <option key={layout.id} value={layout.id}>
                {layout.name}
              </option>
            ))}
          </select>
          {experience.mode === "advanced" && (
            <Button type="button" size="sm" variant="outline" onClick={() => setSaveOpen(true)}>
              <Save />
              Salvar layout
            </Button>
          )}
          {experience.mode === "advanced" && custom && (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => onDeleteLayout(custom.id)}>
              Excluir layout
            </Button>
          )}
          {experience.mode === "advanced" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline">
                  <Plus />
                  Novo painel
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {visibleTools.map(({ type, label, icon: Icon }) => (
                  <DropdownMenuItem key={type} onSelect={() => onNewPanel(type)}>
                    <Icon />
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="sr-only">Progresso do estudo</span>
            <input
              aria-label="Progresso do estudo"
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(event) => onProgressChange(Number(event.target.value))}
              className="w-20 accent-primary"
            />
            <span className="w-8 tabular-nums">{progress}%</span>
          </label>
          <select
            aria-label="Status do estudo"
            value={status}
            onChange={(event) => onStatusChange(event.target.value as StudyStatus)}
            className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="not_started">Não iniciado</option>
            <option value="in_progress">Em andamento</option>
            <option value="completed">Concluído</option>
          </select>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onEnterFocusMode(goalDraft)}
              disabled={pendingRecovery.length > 0}
            >
              <Focus className="size-3.5" />
              {session?.status === "completed" || session?.status === "cancelled" ? "Iniciar modo foco" : "Modo foco"}
            </Button>

            <div className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1">
              <span className="min-w-12 text-center text-xs font-medium tabular-nums" aria-label="Tempo de foco">
                {formatSeconds(session?.focusSeconds)}
              </span>
              {session?.status === "paused" ? (
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Continuar sessão" onClick={onResumeSession}>
                  <Play />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Pausar sessão"
                  onClick={onPauseSession}
                  disabled={!session || session.status === "completed" || session.status === "cancelled"}
                >
                  <Pause />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Encerrar sessão de estudo"
                onClick={onFinishSession}
                disabled={!session || session.status === "completed" || session.status === "cancelled"}
              >
                <Square />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div role="tablist" aria-label="Ferramentas do Workspace" className="premium-scroll flex snap-x gap-1 overflow-x-auto pb-1">
        {visibleTools
          .filter((tool) => tool.type !== "dashboard")
          .map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              type="button"
              role="tab"
              data-state={activeTool === type ? "active" : "inactive"}
              aria-selected={activeTool === type}
              onClick={() => onOpenTool(type)}
              className={`flex h-9 shrink-0 snap-start items-center gap-2 rounded-lg px-3 text-xs font-medium transition-[background-color,color,transform] ${
                activeTool === type
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              {label === "Mapa" ? "Mapa de Conhecimento" : label}
            </button>
          ))}
      </div>

      {session?.status === "completed" && (
        <p role="status" className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
          <Sparkles className="size-3.5" />
          Sessão concluída: {formatSeconds(session.focusSeconds)} de foco, {session.pauseCount} pausa(s).
        </p>
      )}
      {session?.status === "cancelled" && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <XCircle className="size-3.5" />
          Sessão cancelada e não contabilizada.
        </p>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar layout personalizado</DialogTitle>
            <DialogDescription>
              O conjunto e o tamanho atual dos painéis serão reutilizados em qualquer tema.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Nome do layout"
            value={layoutName}
            onChange={(event) => setLayoutName(event.target.value)}
            placeholder="Ex.: Revisão para prova"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                onSaveLayout(layoutName);
                setLayoutName("");
                setSaveOpen(false);
              }}
              disabled={!layoutName.trim()}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

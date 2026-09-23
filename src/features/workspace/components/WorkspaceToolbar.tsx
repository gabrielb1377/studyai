"use client";

import { useState } from "react";
import { BookOpen, Bot, BrainCircuit, ClipboardCheck, FileText, Gauge, GraduationCap, LayoutGrid, Network, NotebookPen, Pause, Play, Plus, Save, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { WorkspaceLayout, WorkspacePanelType, WorkspaceStudySession } from "../types";
import type { StudyStatus } from "@/types/study-engine";
import { useExperiencePreferences } from "@/features/preferences/ExperiencePreferences";

const tools: Array<{ type: WorkspacePanelType; label: string; icon: typeof BookOpen }> = [
  { type: "material", label: "Material", icon: BookOpen },
  { type: "tutor", label: "IA", icon: Bot },
  { type: "mentor", label: "Mentor", icon: GraduationCap },
  { type: "knowledge", label: "Mapa", icon: Network },
  { type: "flashcards", label: "Flashcards", icon: BrainCircuit },
  { type: "quiz", label: "Quiz", icon: ClipboardCheck },
  { type: "notes", label: "Notas", icon: NotebookPen },
  { type: "summaries", label: "Resumos", icon: FileText },
  { type: "dashboard", label: "Dashboard", icon: Gauge },
];

function formatSeconds(value = 0) {
  const minutes = Math.floor(value / 60).toString().padStart(2, "0");
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function WorkspaceToolbar({ layouts, activeLayoutId, activeTool, session, progress, status, onApplyLayout, onOpenTool, onNewPanel, onSaveLayout, onDeleteLayout, onPauseSession, onResumeSession, onFinishSession, onProgressChange, onStatusChange }: {
  layouts: readonly WorkspaceLayout[];
  activeLayoutId: string;
  activeTool?: WorkspacePanelType;
  session?: WorkspaceStudySession;
  progress: number;
  status: StudyStatus;
  onApplyLayout: (layoutId: string) => void;
  onOpenTool: (type: WorkspacePanelType) => void;
  onNewPanel: (type: WorkspacePanelType) => void;
  onSaveLayout: (name: string) => void;
  onDeleteLayout: (layoutId: string) => void;
  onPauseSession: () => void;
  onResumeSession: () => void;
  onFinishSession: () => void;
  onProgressChange: (progress: number) => void;
  onStatusChange: (status: StudyStatus) => void;
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [layoutName, setLayoutName] = useState("");
  const experience = useExperiencePreferences();
  const visibleTools = experience.mode === "advanced" ? tools : tools.filter((tool) => tool.type !== "knowledge" && tool.type !== "dashboard");
  const custom = layouts.find((layout) => layout.id === activeLayoutId && !layout.builtIn);
  return (
    <div className="space-y-3 rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <LayoutGrid className="size-4 text-primary" />
        <label className="sr-only" htmlFor="workspace-layout">Layout do Workspace</label>
        <select id="workspace-layout" aria-label="Layout do Workspace" value={activeLayoutId} onChange={(event) => onApplyLayout(event.target.value)} className="h-9 max-w-44 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
          {layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.name}</option>)}
        </select>
        {experience.mode === "advanced" && <Button type="button" size="sm" variant="outline" onClick={() => setSaveOpen(true)}><Save />Salvar layout</Button>}
        {experience.mode === "advanced" && custom && <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => onDeleteLayout(custom.id)}>Excluir layout</Button>}
        {experience.mode === "advanced" && <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="sm" variant="outline"><Plus />Novo painel</Button></DropdownMenuTrigger><DropdownMenuContent align="start">{visibleTools.map(({ type, label, icon: Icon }) => <DropdownMenuItem key={type} onSelect={() => onNewPanel(type)}><Icon />{label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><span className="sr-only">Progresso do estudo</span><input aria-label="Progresso do estudo" type="range" min={0} max={100} step={5} value={progress} onChange={(event) => onProgressChange(Number(event.target.value))} className="w-20 accent-primary" /><span className="w-8 tabular-nums">{progress}%</span></label>
        <select aria-label="Status do estudo" value={status} onChange={(event) => onStatusChange(event.target.value as StudyStatus)} className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"><option value="not_started">Não iniciado</option><option value="in_progress">Em andamento</option><option value="completed">Concluído</option></select>
        <div className="ml-auto flex items-center gap-2 rounded-lg border bg-background px-2 py-1">
          <span className="min-w-12 text-center text-xs font-medium tabular-nums" aria-label="Tempo de foco">{formatSeconds(session?.focusSeconds)}</span>
          {session?.status === "paused" ? <Button type="button" variant="ghost" size="icon-xs" aria-label="Continuar sessão" onClick={onResumeSession}><Play /></Button> : <Button type="button" variant="ghost" size="icon-xs" aria-label="Pausar sessão" onClick={onPauseSession} disabled={!session || session.status === "completed"}><Pause /></Button>}
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Encerrar sessão de estudo" onClick={onFinishSession} disabled={!session || session.status === "completed"}><Square /></Button>
        </div>
      </div>
      <div role="tablist" aria-label="Ferramentas do Workspace" className="flex gap-1 overflow-x-auto pb-1">
        {visibleTools.filter((tool) => tool.type !== "dashboard").map(({ type, label, icon: Icon }) => <button key={type} type="button" role="tab" data-state={activeTool === type ? "active" : "inactive"} aria-selected={activeTool === type} onClick={() => onOpenTool(type)} className={`flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors ${activeTool === type ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}><Icon className="size-3.5" />{label === "Mapa" ? "Mapa de Conhecimento" : label}</button>)}
      </div>
      {session?.status === "completed" && <p role="status" className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400"><Sparkles className="size-3.5" />Sessão concluída: {formatSeconds(session.focusSeconds)} de foco, {session.pauseCount} pausa(s).</p>}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}><DialogContent><DialogHeader><DialogTitle>Salvar layout personalizado</DialogTitle><DialogDescription>O conjunto e o tamanho atual dos painéis serão reutilizados em qualquer tema.</DialogDescription></DialogHeader><Input aria-label="Nome do layout" value={layoutName} onChange={(event) => setLayoutName(event.target.value)} placeholder="Ex.: Revisão para prova" /><DialogFooter><Button variant="outline" onClick={() => setSaveOpen(false)}>Cancelar</Button><Button onClick={() => { onSaveLayout(layoutName); setLayoutName(""); setSaveOpen(false); }} disabled={!layoutName.trim()}>Salvar</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

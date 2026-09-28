"use client";

import { useEffect, useRef } from "react";
import { Check, FlaskConical, Play, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LabEditor } from "./LabEditor";
import { LabExercisePanel } from "./LabExercisePanel";
import { LabPreview } from "./LabPreview";
import { LabTerminal } from "./LabTerminal";
import { LabCreateDialog } from "./LabCreateDialog";
import { useLab } from "../hooks/useLab";
import { labLanguageLabels } from "../types";

export function LabWorkspace({ studyId, compact = false, academyStudyId, academyContentId, requestedProjectId }: { studyId?: string; compact?: boolean; academyStudyId?: string; academyContentId?: string; requestedProjectId?: string }) {
  const lab = useLab({ studyId });
  const projects = lab.projects;
  const setActiveId = lab.setActiveId;
  const imported = useRef(false);
  useEffect(() => {
    if (!academyStudyId || imported.current || lab.isLoading) return;
    imported.current = true;
    void lab.openAcademy(academyStudyId, academyContentId);
  }, [academyContentId, academyStudyId, lab]);
  useEffect(() => {
    if (requestedProjectId && projects.some((project) => project.id === requestedProjectId)) setActiveId(requestedProjectId);
  }, [projects, requestedProjectId, setActiveId]);
  if (lab.isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (!lab.active) return <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed bg-card/50 p-8 text-center"><div><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FlaskConical /></span><h2 className="mt-4 font-semibold">Comece uma prática</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Crie um exercício seguro para código, SQL, Markdown ou diagramas.</p><div className="mt-5"><LabCreateDialog studies={lab.studies} defaultStudyId={studyId} onCreate={lab.create} /></div></div></div>;
  const project = lab.active;
  const executable = project.language === "javascript" || project.language === "typescript" || project.language === "python" || project.language === "sql";
  const workspace = <div className="space-y-4">
    {lab.error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{lab.error}</p> : null}
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3"><div className="mr-auto min-w-0"><h2 className="truncate text-sm font-semibold">{project.title}</h2><p className="text-xs text-muted-foreground">Autosave · sandbox local</p></div>{executable ? <Button size="sm" onClick={() => void lab.run()} disabled={lab.isRunning}><Play />{lab.isRunning ? "Executando…" : "Executar"}</Button> : null}<Button size="sm" variant="outline" onClick={() => void lab.review()} disabled={lab.isReviewing}><Sparkles />{lab.isReviewing ? "Corrigindo…" : "Corrigir com IA"}</Button><Button size="sm" variant="outline" onClick={() => void lab.complete()} disabled={project.status === "completed"}><Check />Concluir</Button>{!compact ? <Button size="icon-sm" variant="ghost" aria-label="Excluir exercício" className="text-destructive" onClick={() => { if (window.confirm("Excluir este exercício do Laboratório?")) void lab.remove(project); }}><Trash2 /></Button> : null}</div>
    <div className={`grid gap-4 ${compact ? "xl:grid-cols-1" : "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_18rem]"}`}><LabEditor language={project.language} value={project.files[project.language] ?? ""} onChange={lab.updateCode} onLanguageChange={lab.changeLanguage} /><LabPreview project={project} /><LabExercisePanel project={project} /></div>
    <LabTerminal key={project.id} state={project.terminal} onChange={(terminal) => lab.update({ terminal })} />
  </div>;
  if (compact) return workspace;
  return <div className="grid gap-5 xl:grid-cols-[15rem_minmax(0,1fr)]"><aside className="space-y-2"><div className="flex items-center gap-2 px-1 pb-2"><FlaskConical className="size-4 text-primary" /><h2 className="text-sm font-semibold">Exercícios</h2><Badge variant="outline" className="ml-auto">{lab.projects.length}</Badge></div><div className="pb-2"><LabCreateDialog studies={lab.studies} defaultStudyId={studyId} onCreate={lab.create} /></div>{lab.projects.map((item) => <button key={item.id} type="button" onClick={() => lab.setActiveId(item.id)} aria-current={item.id === lab.activeId ? "true" : undefined} className={`w-full rounded-xl border p-3 text-left transition-colors ${item.id === lab.activeId ? "border-primary/40 bg-primary/8" : "bg-card hover:bg-accent/50"}`}><span className="block truncate text-sm font-medium">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{labLanguageLabels[item.language]} · {item.status === "completed" ? "Concluído" : item.status === "in-progress" ? "Em andamento" : "Rascunho"}</span></button>)}</aside>{workspace}</div>;
}

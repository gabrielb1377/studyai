"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, FlaskConical, Play, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { LabEditor } from "./LabEditor";
import { LabExercisePanel } from "./LabExercisePanel";
import { LabPreview } from "./LabPreview";
import { LabTerminal } from "./LabTerminal";
import { LabCreateDialog } from "./LabCreateDialog";
import { LabChallengeDialog } from "./LabChallengeDialog";
import { useLab } from "../hooks/useLab";
import { LabService } from "../services/LabService";
import { labLanguageLabels } from "../types";

export function LabWorkspace({
  studyId,
  compact = false,
  academyStudyId,
  academyContentId,
  requestedProjectId,
}: {
  studyId?: string;
  compact?: boolean;
  academyStudyId?: string;
  academyContentId?: string;
  requestedProjectId?: string;
}) {
  const lab = useLab({ studyId });
  const projects = lab.projects;
  const setActiveId = lab.setActiveId;
  const imported = useRef(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!academyStudyId || imported.current || lab.isLoading) return;
    imported.current = true;
    void lab.openAcademy(academyStudyId, academyContentId);
  }, [academyContentId, academyStudyId, lab]);

  useEffect(() => {
    if (requestedProjectId && projects.some((project) => project.id === requestedProjectId)) {
      setActiveId(requestedProjectId);
    }
  }, [projects, requestedProjectId, setActiveId]);

  if (lab.isLoading) return <Skeleton className="h-96 rounded-2xl" />;

  if (!lab.active) {
    return (
      <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed bg-card/50 p-8 text-center">
        <div>
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FlaskConical />
          </span>
          <h2 className="mt-4 font-semibold">Comece uma prática</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Crie um exercício seguro para código, SQL, Matemática, visualização de dados, Markdown ou diagramas.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <LabCreateDialog studies={lab.studies} defaultStudyId={studyId} onCreate={lab.create} />
            <LabChallengeDialog studies={lab.studies} defaultStudyId={studyId} onCreate={lab.create} />
          </div>
        </div>
      </div>
    );
  }

  const project = lab.active;
  const currentCode = project.files[project.language] ?? "";
  const starterCode =
    project.language === project.exercise.language && project.exercise.starterCode
      ? project.exercise.starterCode
      : LabService.template(project.language);
  const canReset = currentCode !== starterCode;
  const executable =
    project.language === "javascript" ||
    project.language === "sql" ||
    project.language === "math" ||
    project.language === "data";

  const normalizedFilter = filter.trim().toLocaleLowerCase();
  const filteredProjects = normalizedFilter
    ? lab.projects.filter(
        (item) =>
          item.title.toLocaleLowerCase().includes(normalizedFilter) ||
          labLanguageLabels[item.language].toLocaleLowerCase().includes(normalizedFilter) ||
          (item.subject ?? "").toLocaleLowerCase().includes(normalizedFilter),
      )
    : lab.projects;

  const workspace = (
    <div className="space-y-4">
      {lab.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <p className="min-w-0 flex-1">{lab.error}</p>
          {lab.isReviewRateLimited ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void lab.review()}
                disabled={lab.isReviewing || lab.reviewCooldownSeconds > 0}
              >
                <RotateCcw />
                Tentar novamente
              </Button>
              {lab.reviewCooldownSeconds > 0 ? (
                <span aria-live="polite" className="text-xs text-muted-foreground">
                  Disponível em {lab.reviewCooldownSeconds}s
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
        <div className="mr-auto min-w-0">
          <h2 className="truncate text-sm font-semibold">{project.title}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {labLanguageLabels[project.language]} · Autosave · sandbox local
            {project.sourceMaterialName ? ` · Base: ${project.sourceMaterialName}` : ""}
          </p>
        </div>

        {compact ? (
          <LabChallengeDialog compact studies={lab.studies} defaultStudyId={studyId} onCreate={lab.create} />
        ) : null}

        {!compact && project.studyId ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/estudo?tema=${encodeURIComponent(project.studyId)}&aba=lab`}>
              <BookOpen />
              Abrir estudo
            </Link>
          </Button>
        ) : null}

        {executable ? (
          <Button size="sm" onClick={() => void lab.run()} disabled={lab.isRunning}>
            <Play />
            {lab.isRunning ? "Executando…" : "Executar"}
          </Button>
        ) : null}

        <Button
          size="sm"
          variant="outline"
          onClick={() => void lab.review()}
          disabled={lab.isReviewing || lab.reviewCooldownSeconds > 0}
        >
          <Sparkles />
          {lab.isReviewing ? "Corrigindo…" : "Corrigir com IA"}
        </Button>

        <Button size="sm" variant="outline" onClick={() => void lab.complete()} disabled={project.status === "completed"}>
          <Check />
          Concluir
        </Button>

        {!compact ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Excluir exercício"
            className="text-destructive"
            onClick={() => {
              if (window.confirm("Excluir este exercício do Laboratório?")) void lab.remove(project);
            }}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>

      <div className={`grid gap-4 ${compact ? "xl:grid-cols-1" : "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_18rem]"}`}>
        <LabEditor
          language={project.language}
          value={currentCode}
          canReset={canReset}
          onChange={lab.updateCode}
          onLanguageChange={lab.changeLanguage}
          onReset={() => void lab.resetCode()}
        />
        <LabPreview project={project} />
        <LabExercisePanel project={project} onToggleStep={(stepId) => void lab.toggleStep(stepId)} />
      </div>

      <LabTerminal key={project.id} state={project.terminal} onChange={(terminal) => lab.update({ terminal })} />
    </div>
  );

  if (compact) return workspace;

  return (
    <div className="grid gap-5 xl:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="space-y-2">
        <div className="flex items-center gap-2 px-1 pb-2">
          <FlaskConical className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Exercícios</h2>
          <Badge variant="outline" className="ml-auto">
            {lab.projects.length}
          </Badge>
        </div>

        <div className="flex flex-col gap-2 pb-1">
          <LabCreateDialog studies={lab.studies} defaultStudyId={studyId} onCreate={lab.create} />
          <LabChallengeDialog fullWidth studies={lab.studies} defaultStudyId={studyId} onCreate={lab.create} />
        </div>

        {lab.projects.length > 1 ? (
          <div className="relative pb-1">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
            <Input
              aria-label="Filtrar exercícios"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filtrar exercícios…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        ) : null}

        {filteredProjects.length ? (
          filteredProjects.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => lab.setActiveId(item.id)}
              aria-current={item.id === lab.activeId ? "true" : undefined}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${
                item.id === lab.activeId ? "border-primary/40 bg-primary/8" : "bg-card hover:bg-accent/50"
              }`}
            >
              <span className="block truncate text-sm font-medium">{item.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {labLanguageLabels[item.language]} ·{" "}
                {item.status === "completed" ? "Concluído" : item.status === "in-progress" ? "Em andamento" : "Rascunho"}
              </span>
            </button>
          ))
        ) : (
          <p className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">
            Nenhum exercício encontrado para esse filtro.
          </p>
        )}
      </aside>
      {workspace}
    </div>
  );
}

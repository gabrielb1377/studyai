"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, Download, FileText, Loader2, Presentation, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StudioExportService, type StudioExportKind } from "../export/service";
import type { StudioDocument } from "../types";

type ExportState = "idle" | "generating" | "done" | "error";

type ExportOutcome = {
  kind: StudioExportKind;
  fileName: string;
  size: number;
  pageCount?: number;
  slideCount?: number;
  materialId: string;
};

interface StudioExportPanelProps {
  document: StudioDocument;
  studySubject?: string;
  studyTopic?: string;
  onExported?: (outcome: ExportOutcome) => void;
}

export function StudioExportPanel({ document, studySubject, studyTopic, onExported }: StudioExportPanelProps) {
  const [state, setState] = useState<ExportState>("idle");
  const [activeKind, setActiveKind] = useState<StudioExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ExportOutcome | null>(null);
  const [includeAnswers, setIncludeAnswers] = useState(true);

  const run = useCallback(async (kind: StudioExportKind) => {
    if (state === "generating") return;
    setState("generating");
    setActiveKind(kind);
    setError(null);
    setOutcome(null);
    try {
      const result = await StudioExportService.export(document, kind, {
        includeAnswers,
        studySubject,
        studyTopic,
      });
      const next: ExportOutcome = {
        kind,
        fileName: result.fileName,
        size: result.size,
        pageCount: result.pageCount,
        slideCount: result.slideCount,
        materialId: result.material.id,
      };
      setOutcome(next);
      setState("done");
      onExported?.(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar a exportação.");
      setState("error");
    } finally {
      setActiveKind(null);
    }
  }, [document, includeAnswers, onExported, state, studySubject, studyTopic]);

  const busy = state === "generating";

  return (
    <div className="space-y-3 p-2">
      <div className="rounded-xl bg-muted/40 p-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Exportação</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          A exportação usa o template, as cores, a tipografia e a orientação escolhidos no Studio.
          O arquivo é gerado no navegador e salvo na Biblioteca.
        </p>
      </div>

      <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        <input
          type="checkbox"
          className="size-4 rounded border-input accent-primary"
          checked={includeAnswers}
          onChange={(event) => setIncludeAnswers(event.target.checked)}
          disabled={busy}
        />
        Incluir respostas dos exercícios
      </label>

      <div className="grid gap-2">
        <Button type="button" size="sm" className="w-full justify-start" disabled={busy} onClick={() => void run("pdf")}>
          {busy && activeKind === "pdf" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <FileText className="size-3.5" aria-hidden="true" />}
          {busy && activeKind === "pdf" ? "Gerando PDF..." : "Exportar PDF"}
        </Button>
        <Button type="button" size="sm" variant="outline" className="w-full justify-start" disabled={busy} onClick={() => void run("pptx")}>
          {busy && activeKind === "pptx" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Presentation className="size-3.5" aria-hidden="true" />}
          {busy && activeKind === "pptx" ? "Gerando apresentação..." : "Exportar PowerPoint"}
        </Button>
      </div>

      {busy ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Preparando o arquivo...
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : null}

      {outcome && state === "done" ? (
        <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3" role="status">
          <p className="flex items-center gap-2 text-xs font-semibold">
            <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" /> Exportação concluída
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{outcome.fileName}</p>
          <div className="flex flex-wrap items-center gap-2">
            {outcome.pageCount ? <Badge variant="outline" className="text-[10px]">{outcome.pageCount} páginas</Badge> : null}
            {outcome.slideCount ? <Badge variant="outline" className="text-[10px]">{outcome.slideCount} slides</Badge> : null}
            <Badge variant="outline" className="text-[10px]">{Math.max(1, Math.round(outcome.size / 1024))} KB</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="xs" variant="outline">
              <Link href={`/estudo?tema=${encodeURIComponent(document.studyId)}&arquivo=${encodeURIComponent(outcome.materialId)}&aba=material`}>
                <Download className="size-3 me-1" aria-hidden="true" /> Abrir o material
              </Link>
            </Button>
            <Button asChild size="xs" variant="ghost">
              <Link href="/biblioteca">
                <BookOpen className="size-3 me-1" aria-hidden="true" /> Ver na Biblioteca
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

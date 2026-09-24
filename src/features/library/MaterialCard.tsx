"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Bot, Clock3, Eye, FolderInput, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatFileSize } from "@/features/import/import-utils";
import type { Material } from "@/types/material";
import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import { formatMaterialDate, materialTypes } from "./material-utils";
import type { KnowledgeGraph } from "@/features/semantic/types";
import type { LibraryView } from "./LibraryBrowser";
import { cn } from "@/lib/utils";

export function MaterialCard({ material, content, knowledge, view = "grid", selected = false, onSelectedChange, onMove, onDelete }: { material: Material; content?: ExtractedContent; knowledge?: KnowledgeGraph; view?: LibraryView; selected?: boolean; onSelectedChange?: (selected: boolean) => void; onMove?: () => void; onDelete?: () => void }) {
  const [showDetails, setShowDetails] = useState(false);
  const { icon: Icon, label } = materialTypes[material.fileType];
  const details = [
    { label: "Tamanho", value: formatFileSize(material.size) },
    { label: "Curso", value: material.course ?? "Não informado" },
    { label: "Disciplina", value: material.subject ?? content?.metadata.subject ?? "Não informada" },
    { label: "Tema", value: material.topic ?? content?.metadata.topic ?? "Não informado" },
    ...(
      content?.metadata.subject && content.metadata.topic &&
      (content.metadata.subject !== material.subject || content.metadata.topic !== material.topic)
        ? [{ label: "Identificado", value: `${content.metadata.subject} · ${content.metadata.topic}` }]
        : []
    ),
    { label: "Idioma", value: content?.metadata.language ?? "Não identificado" },
    ...(content?.metadata.pageCount !== undefined
      ? [{ label: "Páginas", value: String(content.metadata.pageCount) }]
      : []),
    ...(content?.metadata.chapters !== undefined
      ? [{ label: "Capítulos", value: String(content.metadata.chapters.length) }]
      : []),
    ...(content?.metadata.readingTimeMinutes !== undefined
      ? [{ label: "Leitura", value: `${content.metadata.readingTimeMinutes} min` }]
      : []),
    ...(knowledge ? [
      { label: "Conceitos", value: String(knowledge.statistics.conceptCount) },
      { label: "Relações", value: String(knowledge.statistics.relationCount) },
      { label: "Estrutura", value: `${knowledge.statistics.structureDegree}%` },
    ] : []),
    {
      label: "Status IA",
      value: content?.metadata.analysisStatus === "analyzed"
        ? "Analisado"
        : content?.metadata.analysisStatus === "fallback"
          ? "Análise básica"
        : content?.status === "error"
          ? "Erro"
          : "Pendente",
    },
    ...(material.relativePath !== material.name
      ? [{ label: "Caminho", value: material.relativePath }]
      : []),
  ];

  return (
    <article
      aria-labelledby={`material-${material.id}`}
      className="render-lazy h-full min-w-0"
    >
      <Card className={cn("surface-hover h-full gap-0 p-5", view !== "grid" && "sm:grid sm:grid-cols-[auto_minmax(12rem,1fr)_minmax(9rem,.42fr)_auto] sm:items-center sm:gap-x-4 sm:p-4")}>
        <div className={cn("flex items-center gap-3", view === "grid" && "mb-4")}>
          <input type="checkbox" checked={selected} onChange={(event) => onSelectedChange?.(event.target.checked)} aria-label={`Selecionar ${material.name}`} className="size-4 accent-primary" />
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
            <Icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <Badge
            variant="outline"
            className="font-normal text-muted-foreground"
          >
            {label}
          </Badge>
          {material.isFavorite && (
            <span className="ml-auto text-primary">
              <Star className="size-4 fill-primary/15" aria-hidden="true" />
              <span className="sr-only">Material favorito</span>
            </span>
          )}
        </div>
        <h3
          id={`material-${material.id}`}
          className={cn("break-words text-sm font-semibold leading-6", view === "grid" && "mb-5")}
        >
          {material.name}
        </h3>
        {(view === "grid" || showDetails) && <dl className={cn("space-y-2.5 text-xs leading-5", view === "grid" ? "mb-5" : "col-span-full mt-4 rounded-xl border bg-secondary/20 p-4 sm:grid sm:grid-cols-2 sm:gap-x-6")}>
          {details.map((detail) => (
            <div
              key={detail.label}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2"
            >
              <dt className="text-muted-foreground">{detail.label}</dt>
              <dd className="break-words">{detail.value}</dd>
            </div>
          ))}
        </dl>}
        <div className={cn("space-y-2", view === "grid" ? "mb-4 border-t pt-4" : "my-3 sm:my-0")}>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{material.status === "ready" ? "Extraído" : material.status === "error" ? "Erro" : "Processando"}</span>
            <span>{material.progress}%</span>
          </div>
          <Progress value={material.progress} aria-label={`Progresso de ${material.name}`} />
        </div>
        {view === "grid" && content?.metadata.keywords?.length ? (
          <p className="mb-4 line-clamp-2 text-xs leading-5 text-muted-foreground">
            <strong className="text-foreground">Palavras-chave:</strong> {content.metadata.keywords.join(", ")}
          </p>
        ) : null}
        {view === "grid" && material.tags?.length ? <p className="mb-4 text-xs text-muted-foreground"><strong className="text-foreground">Tags:</strong> {material.tags.join(", ")}</p> : null}
        {showDetails && (
          <div className="col-span-full mb-4 rounded-xl border bg-secondary/25 p-3 text-xs leading-5 text-muted-foreground">
            <p><strong className="text-foreground">Caminho:</strong> {material.relativePath}</p>
            <p><strong className="text-foreground">Atualizado:</strong> {formatMaterialDate(material.updatedAt)}</p>
            <p><strong className="text-foreground">Palavras:</strong> {content?.metadata.wordCount ?? 0}</p>
            <p><strong className="text-foreground">Conceitos isolados:</strong> {knowledge?.statistics.isolatedConceptCount ?? 0}</p>
          </div>
        )}
        {content?.errorDetails ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <p className="font-medium">{content.errorDetails.reason}</p>
            <p className="mt-1 opacity-80">Etapa: {content.errorDetails.stage}</p>
            <p className="mt-1 opacity-80">{content.errorDetails.suggestedAction}</p>
          </div>
        ) : null}
        <div className={cn("grid grid-cols-2 gap-2", view === "grid" ? "mb-4 border-t pt-4 sm:grid-cols-3" : "sm:flex sm:justify-end")}>
          <Button asChild size="sm" variant="outline"><Link href={`/estudo?tema=${material.studyId ?? ""}&arquivo=${material.id}&aba=material`}><Eye />Abrir</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={`/estudo?tema=${material.studyId ?? ""}&arquivo=${material.id}&aba=flashcards`}><BookOpen />Estudar</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={`/estudo?tema=${material.studyId ?? ""}&arquivo=${material.id}&aba=ia`}><Bot />Tutor</Link></Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowDetails((current) => !current)}><Eye />Detalhes</Button>
          <Button type="button" size="sm" variant="ghost" onClick={onMove}><FolderInput />Mover</Button>
          <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={onDelete}><Trash2 />Excluir</Button>
        </div>
        {view === "grid" && <p className="mt-auto flex items-center gap-1.5 border-t pt-4 text-[11px] leading-5 text-muted-foreground">
          <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Importado em{" "}
            <time dateTime={material.importedAt}>
              {formatMaterialDate(material.importedAt)}
            </time>
          </span>
        </p>}
      </Card>
    </article>
  );
}

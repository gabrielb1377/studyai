import { Clock3, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatFileSize } from "@/features/import/import-utils";
import type { Material } from "@/types/material";
import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import { formatMaterialDate, materialTypes } from "./material-utils";

export function MaterialCard({ material, content }: { material: Material; content?: ExtractedContent }) {
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
    ...(content?.metadata.readingTimeMinutes !== undefined
      ? [{ label: "Leitura", value: `${content.metadata.readingTimeMinutes} min` }]
      : []),
    {
      label: "Status IA",
      value: content?.stages?.find((stage) => stage.id === "analysis")?.status === "completed"
        ? "Analisado"
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
      className="h-full min-w-0"
    >
      <Card className="h-full gap-0 p-5 shadow-none transition-colors hover:border-primary/30">
        <div className="mb-4 flex items-center gap-3">
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
          className="mb-5 break-words text-sm font-semibold leading-6"
        >
          {material.name}
        </h3>
        <dl className="mb-5 space-y-2.5 text-xs leading-5">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2"
            >
              <dt className="text-muted-foreground">{detail.label}</dt>
              <dd className="break-words">{detail.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mb-4 space-y-2 border-t pt-4">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{material.status === "ready" ? "Extraído" : material.status === "error" ? "Erro" : "Processando"}</span>
            <span>{material.progress}%</span>
          </div>
          <Progress value={material.progress} aria-label={`Progresso de ${material.name}`} />
        </div>
        {content?.metadata.keywords?.length ? (
          <p className="mb-4 line-clamp-2 text-xs leading-5 text-muted-foreground">
            <strong className="text-foreground">Palavras-chave:</strong> {content.metadata.keywords.join(", ")}
          </p>
        ) : null}
        {content?.errorDetails ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <p className="font-medium">{content.errorDetails.reason}</p>
            <p className="mt-1 opacity-80">Etapa: {content.errorDetails.stage}</p>
            <p className="mt-1 opacity-80">{content.errorDetails.suggestedAction}</p>
          </div>
        ) : null}
        <p className="mt-auto flex items-center gap-1.5 border-t pt-4 text-[11px] leading-5 text-muted-foreground">
          <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Importado em{" "}
            <time dateTime={material.importedAt}>
              {formatMaterialDate(material.importedAt)}
            </time>
          </span>
        </p>
      </Card>
    </article>
  );
}

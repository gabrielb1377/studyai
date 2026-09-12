import { Clock3, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatFileSize } from "@/features/import/import-utils";
import type { Material } from "@/types/material";
import { formatMaterialDate, materialTypes } from "./material-utils";

export function MaterialCard({ material }: { material: Material }) {
  const { icon: Icon, label } = materialTypes[material.fileType];
  const details = [
    { label: "Tamanho", value: formatFileSize(material.size) },
    { label: "Curso", value: material.course ?? "Não organizado" },
    { label: "Matéria", value: material.subject ?? "Não organizada" },
    { label: "Tema", value: material.topic ?? "Não organizado" },
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

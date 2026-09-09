import { Clock3, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Material } from "@/types/material";
import { formatMaterialDate, materialTypes } from "./material-utils";

export function MaterialCard({ material }: { material: Material }) {
  const { icon: Icon, label } = materialTypes[material.type];
  const details = [
    { label: "Curso", value: material.course },
    { label: "Semestre", value: material.semester },
    { label: "Matéria", value: material.subject },
    { label: "Tema", value: material.topic },
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
        <p className="mt-auto flex items-center gap-1.5 border-t pt-4 text-[11px] leading-5 text-muted-foreground">
          <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Atualizado em{" "}
            <time dateTime={material.updatedAt}>
              {formatMaterialDate(material.updatedAt)}
            </time>
          </span>
        </p>
      </Card>
    </article>
  );
}

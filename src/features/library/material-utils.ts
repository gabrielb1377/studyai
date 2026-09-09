import { FileText, Headphones, Presentation, Video } from "lucide-react";
import type { Material, MaterialFilter, MaterialType } from "@/types/material";

export const materialTypes = {
  pdf: { label: "PDF", icon: FileText },
  video: { label: "Vídeo", icon: Video },
  audio: { label: "Áudio", icon: Headphones },
  slides: { label: "Slides", icon: Presentation },
} satisfies Record<MaterialType, { label: string; icon: typeof FileText }>;

export const materialFilters: { value: MaterialFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  ...Object.entries(materialTypes).map(([value, { label }]) => ({
    value: value as MaterialType,
    label,
  })),
  { value: "favorites", label: "Favoritos" },
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function filterMaterials(
  materials: readonly Material[],
  query: string,
  filter: MaterialFilter,
) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);

  return materials.filter((material) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "favorites" ? material.isFavorite : material.type === filter);
    const text = normalize(
      [
        material.name,
        material.course,
        material.semester,
        material.subject,
        material.topic,
      ].join(" "),
    );
    return matchesFilter && words.every((word) => text.includes(word));
  });
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatMaterialDate(date: string) {
  return dateFormatter.format(new Date(date));
}

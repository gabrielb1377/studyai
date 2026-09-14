import { FileText, Headphones, ImageIcon, Presentation, Video } from "lucide-react";
import type { Material, MaterialCategory, MaterialFileType, MaterialFilter } from "@/types/material";

export const materialTypes = {
  pdf: { label: "PDF", icon: FileText },
  docx: { label: "DOCX", icon: FileText },
  pptx: { label: "Slides", icon: Presentation },
  txt: { label: "TXT", icon: FileText },
  mp4: { label: "Vídeo", icon: Video },
  mp3: { label: "Áudio", icon: Headphones },
  wav: { label: "Áudio", icon: Headphones },
  m4a: { label: "Áudio", icon: Headphones },
  png: { label: "Imagem", icon: ImageIcon },
  jpg: { label: "Imagem", icon: ImageIcon },
  jpeg: { label: "Imagem", icon: ImageIcon },
  webp: { label: "Imagem", icon: ImageIcon },
} satisfies Record<MaterialFileType, { label: string; icon: typeof FileText }>;

const categories: Record<MaterialFileType, MaterialCategory> = {
  pdf: "pdf",
  docx: "document",
  pptx: "slides",
  txt: "document",
  mp4: "video",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
};

export const materialFilters: { value: MaterialFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pdf", label: "PDF" },
  { value: "video", label: "Vídeo" },
  { value: "audio", label: "Áudio" },
  { value: "slides", label: "Slides" },
  { value: "document", label: "Documentos" },
  { value: "image", label: "Imagens" },
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
      (filter === "favorites" ? material.isFavorite : categories[material.fileType] === filter);
    const text = normalize(
      [
        material.name,
        material.course ?? "",
        material.semester ?? "",
        material.subject ?? "",
        material.topic ?? "",
        material.relativePath,
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

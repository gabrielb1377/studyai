import {
  FileText,
  FileType2,
  Headphones,
  Presentation,
  Video,
} from "lucide-react";
import type { ImportFileStatus } from "@/types/import";

export const supportedExtensions = [
  "pdf",
  "docx",
  "pptx",
  "txt",
  "mp4",
  "mp3",
] as const;

export const acceptedFileTypes = [
  ".pdf",
  ".docx",
  ".pptx",
  ".txt",
  ".mp4",
  ".mp3",
].join(",");

export const fileTypeDetails = {
  pdf: { label: "PDF", icon: FileText },
  docx: { label: "DOCX", icon: FileType2 },
  pptx: { label: "PPTX", icon: Presentation },
  txt: { label: "TXT", icon: FileText },
  mp4: { label: "MP4", icon: Video },
  mp3: { label: "MP3", icon: Headphones },
} as const;

export const importStatusDetails: Record<
  ImportFileStatus,
  { label: string; className: string }
> = {
  uploaded: {
    label: "Não iniciado",
    className: "text-muted-foreground",
  },
  processing: { label: "Processando...", className: "text-primary" },
  complete: { label: "Extraído", className: "text-primary" },
  error: { label: "Erro", className: "text-destructive" },
};

export function getFileExtension(name: string) {
  return name.split(".").pop()?.toLocaleLowerCase("pt-BR") ?? "";
}

export function isSupportedFile(file: File) {
  return supportedExtensions.includes(
    getFileExtension(file.name) as (typeof supportedExtensions)[number],
  );
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 ** 2).toFixed(1)} MB`;
}

export function getFileIdentity(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

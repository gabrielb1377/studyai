export const materialFileTypes = [
  "pdf",
  "docx",
  "pptx",
  "txt",
  "mp3",
  "wav",
  "m4a",
  "mp4",
  "png",
  "jpg",
  "jpeg",
  "webp",
] as const;

export type MaterialFileType = (typeof materialFileTypes)[number];
export type MaterialCategory = "pdf" | "video" | "audio" | "slides" | "document" | "image";
export type MaterialStatus = "processing" | "ready" | "error";
export type AcademyMaterialKind = "free-study" | "learning-path" | "practical-project" | "summary" | "exercise" | "generated-pdf" | "generated-workbook" | "generated-presentation";

export type Material = {
  id: string;
  fileId: string;
  identity: string;
  contentHash?: string;
  name: string;
  relativePath: string;
  fileType: MaterialFileType;
  mimeType: string;
  size: number;
  lastModified: number;
  importedAt: string;
  updatedAt: string;
  progress: number;
  status: MaterialStatus;
  error?: string;
  isFavorite: boolean;
  studyId?: string;
  course?: string;
  semester?: string;
  subject?: string;
  topic?: string;
  institution?: string;
  professor?: string;
  tags?: string[];
  persistentBinary?: boolean;
  sourceType?: "imported" | "ai-generated" | "lab";
  academyStudyId?: string;
  academyContentId?: string;
  academyMaterialKind?: AcademyMaterialKind;
  labProjectId?: string;
};

export type MaterialFilter =
  | "all"
  | MaterialCategory
  | "favorites"
  | "ai-generated"
  | "academy"
  | "lab"
  | "generated-pdf"
  | "generated-presentation"
  | "practical-project"
  | "learning-path";

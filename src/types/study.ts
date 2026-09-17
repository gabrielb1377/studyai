export type StudyMaterialType = "pdf" | "video" | "audio" | "text" | "image" | "document";

export type StudyMaterial = {
  id: string;
  name: string;
  type: StudyMaterialType;
  mimeType: string;
  size: number;
  source?: string;
  textContent?: string;
  chapters?: Array<{
    id: string;
    title: string;
    page?: number;
    slide?: number;
  }>;
  persistentBinary?: boolean;
  lastModified?: number;
};

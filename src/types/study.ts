export type StudyMaterialType = "pdf" | "video" | "audio" | "text" | "image" | "document";

export type StudyMaterial = {
  id: string;
  name: string;
  type: StudyMaterialType;
  mimeType: string;
  size: number;
  source?: string;
  textContent?: string;
};

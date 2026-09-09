export type Topic = {
  id: string;
  title: string;
  subject: string;
  description: string;
  progress: number;
  lastStudied: string;
};

export type StudyMaterialType = "pdf" | "video" | "audio" | "txt";

export type StudyMaterial = {
  id: string;
  name: string;
  type: StudyMaterialType;
  label: string;
  size: string;
  source?: string;
  textContent?: string;
};

export type StudyMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export type StudyTool = {
  id: "flashcards" | "quiz" | "notes";
  title: string;
  description: string;
};

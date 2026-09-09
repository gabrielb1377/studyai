export type MaterialType = "pdf" | "video" | "audio" | "slides";

export type Material = {
  id: string;
  name: string;
  type: MaterialType;
  course: string;
  semester: string;
  subject: string;
  topic: string;
  updatedAt: string;
  isFavorite: boolean;
};

export type MaterialFilter = "all" | MaterialType | "favorites";

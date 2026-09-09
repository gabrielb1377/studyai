export type ImportFileStatus = "uploaded" | "processing" | "complete";

export type ImportFile = {
  id: string;
  file: File;
  extension: string;
  progress: number;
  status: ImportFileStatus;
};

export type ImportPhase = "idle" | "processing" | "complete";

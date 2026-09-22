export const workspacePanelTypes = [
  "material",
  "tutor",
  "mentor",
  "summaries",
  "flashcards",
  "quiz",
  "notes",
  "knowledge",
  "dashboard",
] as const;

export type WorkspacePanelType = (typeof workspacePanelTypes)[number];

export type WorkspacePanel = {
  id: string;
  type: WorkspacePanelType;
  title: string;
  size: number;
  minimized: boolean;
  maximized: boolean;
  restoreSize?: number;
  resourceId?: string;
  scrollTop: number;
  createdAt: string;
};

export type WorkspaceLayout = {
  id: string;
  name: string;
  builtIn: boolean;
  panels: Array<Pick<WorkspacePanel, "type" | "title" | "size">>;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceRuntimeState = {
  version: 2;
  studyId: string;
  layoutId: string;
  panels: WorkspacePanel[];
  activePanelId?: string;
  filters: Record<string, string>;
  updatedAt: string;
};

export type StudySessionStatus = "active" | "paused" | "completed";

export type WorkspaceStudySession = {
  id: string;
  studyId: string;
  startedAt: string;
  endedAt?: string;
  status: StudySessionStatus;
  durationSeconds: number;
  focusSeconds: number;
  pausedSeconds: number;
  pauseCount: number;
  activePauseStartedAt?: string;
  fileIds: string[];
  tools: WorkspacePanelType[];
  updatedAt: string;
};

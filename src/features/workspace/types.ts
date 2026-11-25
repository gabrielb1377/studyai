export const workspacePanelTypes = [
  "material",
  "tutor",
  "mentor",
  "summaries",
  "flashcards",
  "quiz",
  "notes",
  "lab",
  "knowledge",
  "dashboard",
  "review",
  "ai-quality",
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

export type StudySessionStatus = "active" | "paused" | "completed" | "cancelled";

export type StudySessionOrigin = "workspace" | "focus";

export type WorkspaceStudySession = {
  id: string;
  studyId: string;
  userId?: string;
  subject?: string;
  studyTitle?: string;
  goalLabel?: string;
  origin?: StudySessionOrigin;
  focusMode?: boolean;
  startedAt: string;
  endedAt?: string;
  status: StudySessionStatus;
  durationSeconds: number;
  focusSeconds: number;
  pausedSeconds: number;
  pausedMs?: number;
  pauseCount: number;
  activePauseStartedAt?: string;
  manualPause?: boolean;
  recordedAt?: string;
  fileIds: string[];
  tools: WorkspacePanelType[];
  chapterSeconds?: Record<string, number>;
  activeChapter?: string;
  activeChapterStartedAt?: string;
  updatedAt: string;
};

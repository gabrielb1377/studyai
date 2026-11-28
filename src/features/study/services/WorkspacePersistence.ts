import { SessionOperationManager } from "@/features/account/SessionOperationManager";

export const workspaceTabs = ["material", "ia", "mentor", "knowledge", "flashcards", "quiz", "notes", "lab", "revisao", "ia-quality"] as const;
export type WorkspaceTab = (typeof workspaceTabs)[number];

export type PdfAnnotationKind = "highlight" | "comment" | "drawing" | "link";

export type PdfAnnotation = {
  id: string;
  kind: PdfAnnotationKind;
  page: number;
  color: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  targetPage?: number;
  points?: Array<{ x: number; y: number }>;
  createdAt: string;
};

export type PdfViewState = {
  page: number;
  zoom: number;
  chapterIndex: number;
  bookmarks: number[];
  annotations?: PdfAnnotation[];
  pageHistory?: number[];
};

export type QuizViewState = {
  index: number;
  answers: Array<number | null>;
  isFinished: boolean;
  mode?: "practice" | "exam";
  /** Tentativa protegida ativa; nunca contém o gabarito. */
  attemptId?: string;
  secureAnswers?: Array<number | null>;
  secureFinished?: boolean;
};

export type StudyWorkspaceState = {
  activeTab: WorkspaceTab;
  materialId?: string;
  pdf: Record<string, PdfViewState>;
  flashcardIndex: number;
  quiz: QuizViewState;
  noteId?: string;
  updatedAt: string;
};

export type ExpectedWorkspaceSession = {
  readonly userId: string;
  readonly generation?: number;
};

const VERSION = 2;
export const WORKSPACE_STATE_KEY_PREFIX = "studyai:workspace:u:";
export const WORKSPACE_CURRENT_KEY_PREFIX = "studyai:workspace-current:u:";

function sanitizeOwnerSegment(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function workspaceStateKey(userId: string, studyId: string): string {
  return `${WORKSPACE_STATE_KEY_PREFIX}${sanitizeOwnerSegment(userId)}:${studyId}`;
}

export function workspaceCurrentStudyKey(userId: string): string {
  return `${WORKSPACE_CURRENT_KEY_PREFIX}${sanitizeOwnerSegment(userId)}`;
}

function activeSessionUser(expected?: ExpectedWorkspaceSession): string | null {
  if (typeof window === "undefined") return null;
  const session = SessionOperationManager.current();
  if (session.suspended || !session.userId) return null;
  if (expected) {
    if (session.userId !== expected.userId) return null;
    if (expected.generation !== undefined && session.generation !== expected.generation) return null;
  }
  return session.userId;
}

const DEFAULT_STATE: StudyWorkspaceState = {
  activeTab: "material",
  pdf: {},
  flashcardIndex: 0,
  quiz: { index: 0, answers: [], isFinished: false },
  updatedAt: "",
};

function isWorkspaceTab(value: unknown): value is WorkspaceTab {
  return typeof value === "string" && workspaceTabs.includes(value as WorkspaceTab);
}

function normalizeAnswers(value: unknown): Array<number | null> {
  return Array.isArray(value)
    ? value.map((answer) => typeof answer === "number" && Number.isInteger(answer) && answer >= 0 && answer < 5 ? answer : null)
    : [];
}

function normalize(value: unknown): StudyWorkspaceState {
  if (!value || typeof value !== "object") return { ...DEFAULT_STATE, pdf: {}, quiz: { ...DEFAULT_STATE.quiz } };
  const state = value as Partial<StudyWorkspaceState>;
  return {
    activeTab: isWorkspaceTab(state.activeTab) ? state.activeTab : "material",
    materialId: typeof state.materialId === "string" ? state.materialId : undefined,
    pdf: state.pdf && typeof state.pdf === "object" ? state.pdf : {},
    flashcardIndex: typeof state.flashcardIndex === "number" ? Math.max(0, state.flashcardIndex) : 0,
    quiz: state.quiz && typeof state.quiz === "object"
      ? {
          index: typeof state.quiz.index === "number" ? Math.max(0, state.quiz.index) : 0,
          answers: normalizeAnswers(state.quiz.answers),
          isFinished: state.quiz.isFinished === true,
          mode: state.quiz.mode === "exam" ? "exam" : "practice",
          attemptId: typeof state.quiz.attemptId === "string" && state.quiz.attemptId ? state.quiz.attemptId : undefined,
          secureAnswers: normalizeAnswers(state.quiz.secureAnswers),
          secureFinished: state.quiz.secureFinished === true,
        }
      : { ...DEFAULT_STATE.quiz },
    noteId: typeof state.noteId === "string" ? state.noteId : undefined,
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : "",
  };
}

export const WorkspacePersistence = {
  load(studyId: string, expected?: ExpectedWorkspaceSession): StudyWorkspaceState {
    const userId = activeSessionUser(expected);
    if (!userId) return normalize(null);
    try {
      // Nunca lê nem migra automaticamente a chave global legada `studyai:workspace:<studyId>`.
      const parsed: unknown = JSON.parse(
        window.localStorage.getItem(workspaceStateKey(userId, studyId)) ?? "null",
      );
      if (parsed && typeof parsed === "object" && "ownerId" in parsed && (parsed as { ownerId?: unknown }).ownerId !== userId) {
        return normalize(null);
      }
      return normalize(parsed);
    } catch {
      return normalize(null);
    }
  },

  save(studyId: string, changes: Partial<StudyWorkspaceState>, expected?: ExpectedWorkspaceSession) {
    const userId = activeSessionUser(expected);
    if (!userId) return normalize(null);
    const next = { ...this.load(studyId, expected), ...changes, updatedAt: new Date().toISOString() };
    // Revalida identidade e geração imediatamente antes da escrita efetiva
    if (activeSessionUser(expected) !== userId) return normalize(null);
    try {
      window.localStorage.setItem(
        workspaceStateKey(userId, studyId),
        JSON.stringify({ version: VERSION, ownerId: userId, ...next }),
      );
      window.localStorage.setItem(workspaceCurrentStudyKey(userId), studyId);
    } catch (error) {
      const isQuota = error instanceof DOMException && error.name === "QuotaExceededError";
      window.dispatchEvent(new CustomEvent("studyai:storage-error", {
        detail: {
          code: isQuota ? "FULL" : "UNAVAILABLE",
          message: isQuota
            ? "O armazenamento local do navegador está cheio e não conseguiu salvar o estado do estudo."
            : "Não foi possível gravar as preferências locais do estudo neste navegador.",
        },
      }));
      return next;
    }
    window.dispatchEvent(new Event("studyai:workspace-updated"));
    return next;
  },

  savePdf(studyId: string, materialId: string, pdf: PdfViewState, expected?: ExpectedWorkspaceSession) {
    const current = this.load(studyId, expected);
    return this.save(studyId, { pdf: { ...current.pdf, [materialId]: pdf }, materialId }, expected);
  },

  loadLastStudyId(expected?: ExpectedWorkspaceSession) {
    const userId = activeSessionUser(expected);
    if (!userId) return null;
    try {
      // Nunca lê a chave global legada `studyai:workspace-current`.
      return window.localStorage.getItem(workspaceCurrentStudyKey(userId));
    } catch {
      return null;
    }
  },
};

export const workspaceTabs = ["material", "ia", "flashcards", "quiz", "notes"] as const;
export type WorkspaceTab = (typeof workspaceTabs)[number];

export type PdfViewState = {
  page: number;
  zoom: number;
  chapterIndex: number;
  bookmarks: number[];
};

export type QuizViewState = {
  index: number;
  answers: number[];
  isFinished: boolean;
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

const VERSION = 1;
const PREFIX = "studyai:workspace:";
const LAST_STUDY_KEY = "studyai:workspace-current";

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
          answers: Array.isArray(state.quiz.answers) ? state.quiz.answers.filter((answer) => typeof answer === "number") : [],
          isFinished: state.quiz.isFinished === true,
        }
      : { ...DEFAULT_STATE.quiz },
    noteId: typeof state.noteId === "string" ? state.noteId : undefined,
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : "",
  };
}

export const WorkspacePersistence = {
  load(studyId: string): StudyWorkspaceState {
    if (typeof window === "undefined") return normalize(null);
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(`${PREFIX}${studyId}`) ?? "null");
      return normalize(parsed);
    } catch {
      return normalize(null);
    }
  },

  save(studyId: string, changes: Partial<StudyWorkspaceState>) {
    const next = { ...this.load(studyId), ...changes, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(`${PREFIX}${studyId}`, JSON.stringify({ version: VERSION, ...next }));
    window.localStorage.setItem(LAST_STUDY_KEY, studyId);
    window.dispatchEvent(new Event("studyai:workspace-updated"));
    return next;
  },

  savePdf(studyId: string, materialId: string, pdf: PdfViewState) {
    const current = this.load(studyId);
    return this.save(studyId, { pdf: { ...current.pdf, [materialId]: pdf }, materialId });
  },

  loadLastStudyId() {
    return typeof window === "undefined" ? null : window.localStorage.getItem(LAST_STUDY_KEY);
  },
};


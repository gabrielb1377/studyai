export const labLanguages = ["javascript", "typescript", "html", "css", "sql", "markdown", "mermaid", "python"] as const;
export type LabLanguage = (typeof labLanguages)[number];

export type LabDifficulty = "easy" | "medium" | "hard";
export type LabProjectStatus = "draft" | "in-progress" | "completed";

export type LabExercise = {
  statement: string;
  language: LabLanguage;
  starterCode: string;
  expectedResult: string;
  hints: string[];
  solution: string;
  difficulty: LabDifficulty;
};

export type LabExecutionResult = {
  status: "success" | "error" | "unsupported";
  output: string[];
  error?: string;
  durationMs: number;
  columns?: string[];
  rows?: Array<Array<string | number | null>>;
  createdAt: string;
};

export type LabFeedback = {
  correct: string[];
  incorrect: string[];
  explanation: string;
  improvement: string;
  alternativeSolution: string;
  nextExercises: string[];
  score: number;
  provider: string;
  model: string;
  createdAt: string;
};

export type VirtualTerminalEntry = {
  id: string;
  command: string;
  output: string;
  createdAt: string;
};

export type VirtualTerminalState = {
  cwd: string;
  directories: string[];
  files: Record<string, string>;
  history: VirtualTerminalEntry[];
};

export type LabProject = {
  id: string;
  title: string;
  language: LabLanguage;
  files: Partial<Record<LabLanguage, string>>;
  studyId?: string;
  academyStudyId?: string;
  academyContentId?: string;
  subject?: string;
  topic?: string;
  exercise: LabExercise;
  status: LabProjectStatus;
  attempts: number;
  correctAttempts: number;
  wrongAttempts: number;
  practicedSeconds: number;
  lastResult?: LabExecutionResult;
  feedback?: LabFeedback;
  terminal: VirtualTerminalState;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
};

export type CreateLabProjectInput = {
  title: string;
  language: LabLanguage;
  studyId?: string;
  subject?: string;
  topic?: string;
  exercise?: Partial<LabExercise>;
  academyStudyId?: string;
  academyContentId?: string;
};

export type LabReviewRequest = {
  projectId: string;
  studyId?: string;
  subject?: string;
  topic?: string;
  language: LabLanguage;
  statement: string;
  answer: string;
  expectedResult: string;
  errors: string[];
  context: Array<{ sourceName: string; text: string }>;
};

export const labLanguageLabels: Record<LabLanguage, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
  markdown: "Markdown",
  mermaid: "Mermaid",
  python: "Python",
};

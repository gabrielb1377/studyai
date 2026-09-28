export const academyLevels = ["basic", "intermediate", "advanced", "technical", "quick-review"] as const;
export const academyGoals = ["college", "exam", "public-exam", "work", "curiosity", "programming", "practical-project"] as const;
export const academyLanguages = ["pt-BR", "en", "es"] as const;
export const academyDepths = ["essential", "balanced", "deep"] as const;
export const academyStyles = ["structured", "practical", "visual", "socratic"] as const;
export const academyContentKinds = ["study-material", "learning-path", "practical-project"] as const;
export const academyGenerationStages = ["outline", "lessons", "practice"] as const;
export const academyExportKinds = ["pdf", "workbook", "presentation"] as const;

export type AcademyLevel = (typeof academyLevels)[number];
export type AcademyGoal = (typeof academyGoals)[number];
export type AcademyLanguage = (typeof academyLanguages)[number];
export type AcademyDepth = (typeof academyDepths)[number];
export type AcademyStyle = (typeof academyStyles)[number];
export type AcademyContentKind = (typeof academyContentKinds)[number];
export type AcademyGenerationStage = (typeof academyGenerationStages)[number];
export type AcademyExportKind = (typeof academyExportKinds)[number];
export type AcademyStudyStatus = "draft" | "generating" | "ready" | "in-progress" | "completed" | "error";

export type AcademyModule = {
  id: string;
  title: string;
  order: number;
  status: "not-started" | "in-progress" | "completed";
  progress: number;
  estimatedMinutes: number;
  objective?: string;
  chapterIds?: string[];
};

export type AcademyChapter = {
  id: string;
  title: string;
  objective: string;
  content: string;
  concepts: string[];
  examples: string[];
};

export type AcademyExercise = {
  id: string;
  type: "multiple-choice" | "true-false" | "discursive" | "code" | "practical";
  question: string;
  guidance: string;
  answer: string;
  difficulty: "easy" | "medium" | "hard";
};

export type AcademyGeneratedFlashcard = {
  question: string;
  answer: string;
  difficulty: "easy" | "medium" | "hard";
};

export type AcademyGeneratedQuizQuestion = {
  question: string;
  alternatives: [string, string, string, string];
  correctAnswer: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
};

export type AcademyTrailDay = {
  day: number;
  goal: string;
  lesson: string;
  exercise: string;
  review: string;
  checkpoint?: string;
};

export type AcademyPracticalProject = {
  objective: string;
  technologies: string[];
  requirements: string[];
  steps: string[];
  challenges: string[];
  checklist: string[];
  completionCriteria: string[];
};

export type AcademyGeneratedContent = {
  id: string;
  kind: AcademyContentKind;
  title: string;
  objective: string;
  prerequisites: string[];
  modules: AcademyModule[];
  chapters: AcademyChapter[];
  concepts: Array<{ name: string; description: string; relatedTo: string[] }>;
  examples: string[];
  exercises: AcademyExercise[];
  summary: string;
  review: string[];
  nextSteps: string[];
  studyPlan: string[];
  flashcards: AcademyGeneratedFlashcard[];
  quiz: AcademyGeneratedQuizQuestion[];
  trail?: AcademyTrailDay[];
  project?: AcademyPracticalProject;
  generatedAt: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
};

export type AcademyExportRecord = {
  id: string;
  contentId: string;
  materialId: string;
  kind: AcademyExportKind;
  format: "pdf" | "pptx";
  fileName: string;
  size: number;
  pageCount?: number;
  slideCount?: number;
  persistentBinary: boolean;
  diagramMode: "mermaid-source";
  createdAt: string;
};

export type AcademyOutlineResult = Pick<AcademyGeneratedContent, "title" | "objective" | "prerequisites" | "modules" | "nextSteps">;
export type AcademyLessonsResult = Pick<AcademyGeneratedContent, "chapters" | "concepts" | "examples" | "summary" | "review">;
export type AcademyPracticeResult = Pick<AcademyGeneratedContent, "exercises" | "studyPlan" | "flashcards" | "quiz" | "trail" | "project">;

export type AcademyGenerationResult = {
  stage: AcademyGenerationStage;
  data: AcademyOutlineResult | AcademyLessonsResult | AcademyPracticeResult;
  provider: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  cached?: boolean;
};

export type AcademyStudy = {
  id: string;
  title: string;
  topic: string;
  subject: string;
  level: AcademyLevel;
  goal: AcademyGoal;
  duration: number;
  language: AcademyLanguage;
  depth: AcademyDepth;
  style: AcademyStyle;
  status: AcademyStudyStatus;
  createdAt: string;
  updatedAt: string;
  sourceType: "ai-generated";
  modules: AcademyModule[];
  progress: number;
  contents: AcademyGeneratedContent[];
  exports: AcademyExportRecord[];
  generationError?: string;
};

export type CreateAcademyStudyInput = Pick<
  AcademyStudy,
  "topic" | "subject" | "level" | "goal" | "duration" | "language" | "depth" | "style"
> & { title?: string };

export type AcademyWorkspaceContract = {
  version: 1;
  sourceType: "academy";
  academyStudyId: string;
  studyId: string;
  preferredPanel: "overview";
};

export const academyLabels = {
  levels: {
    basic: "Básico",
    intermediate: "Intermediário",
    advanced: "Avançado",
    technical: "Técnico",
    "quick-review": "Revisão rápida",
  },
  goals: {
    college: "Faculdade",
    exam: "Prova",
    "public-exam": "Concurso",
    work: "Trabalho",
    curiosity: "Curiosidade",
    programming: "Programação",
    "practical-project": "Projeto prático",
  },
  languages: { "pt-BR": "Português", en: "Inglês", es: "Espanhol" },
  depths: { essential: "Essencial", balanced: "Equilibrada", deep: "Profunda" },
  styles: { structured: "Estruturado", practical: "Prático", visual: "Visual", socratic: "Socrático" },
  contentKinds: { "study-material": "Material de estudo", "learning-path": "Trilha", "practical-project": "Projeto prático" },
  exportKinds: { pdf: "PDF Gerado", workbook: "Apostila Gerada", presentation: "Apresentação Gerada" },
} as const;

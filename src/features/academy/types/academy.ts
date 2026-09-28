export const academyLevels = ["basic", "intermediate", "advanced", "technical", "quick-review"] as const;
export const academyGoals = ["college", "exam", "public-exam", "work", "curiosity", "programming", "practical-project"] as const;
export const academyLanguages = ["pt-BR", "en", "es"] as const;
export const academyDepths = ["essential", "balanced", "deep"] as const;
export const academyStyles = ["structured", "practical", "visual", "socratic"] as const;

export type AcademyLevel = (typeof academyLevels)[number];
export type AcademyGoal = (typeof academyGoals)[number];
export type AcademyLanguage = (typeof academyLanguages)[number];
export type AcademyDepth = (typeof academyDepths)[number];
export type AcademyStyle = (typeof academyStyles)[number];
export type AcademyStudyStatus = "draft" | "ready" | "in-progress" | "completed";

export type AcademyModule = {
  id: string;
  title: string;
  order: number;
  status: "not-started" | "in-progress" | "completed";
  progress: number;
  estimatedMinutes: number;
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
} as const;

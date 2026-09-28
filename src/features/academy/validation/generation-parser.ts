import type {
  AcademyChapter,
  AcademyExercise,
  AcademyGenerationStage,
  AcademyLessonsResult,
  AcademyModule,
  AcademyOutlineResult,
  AcademyPracticeResult,
} from "../types";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("O provider retornou uma estrutura inválida.");
  return value as JsonObject;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function texts(value: unknown, limit: number) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean).slice(0, limit) : [];
}

function id(prefix: string, index: number) {
  return `${prefix}-${Date.now()}-${index + 1}`;
}

function difficulty(value: unknown): "easy" | "medium" | "hard" {
  return value === "easy" || value === "hard" ? value : "medium";
}

function parseJson(raw: string) {
  const normalized = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return object(JSON.parse(normalized));
  } catch {
    throw new Error("O provider não retornou JSON válido. Tente gerar novamente.");
  }
}

function parseOutline(value: JsonObject): AcademyOutlineResult {
  const modules: AcademyModule[] = (Array.isArray(value.modules) ? value.modules : []).slice(0, 12).map((item, index) => {
    const moduleData = object(item);
    return {
      id: id("academy-module", index),
      title: text(moduleData.title, `Módulo ${index + 1}`),
      objective: text(moduleData.objective),
      estimatedMinutes: Math.max(5, Math.min(240, Number(moduleData.estimatedMinutes) || 30)),
      order: index,
      status: "not-started",
      progress: 0,
      chapterIds: [],
    };
  });
  if (!text(value.title) || !text(value.objective) || modules.length === 0) {
    throw new Error("O plano gerado está incompleto. Tente novamente.");
  }
  return {
    title: text(value.title),
    objective: text(value.objective),
    prerequisites: texts(value.prerequisites, 12),
    modules,
    nextSteps: texts(value.nextSteps, 12),
  };
}

function parseLessons(value: JsonObject): AcademyLessonsResult {
  const chapters: AcademyChapter[] = (Array.isArray(value.chapters) ? value.chapters : []).slice(0, 20).map((item, index) => {
    const chapter = object(item);
    return {
      id: id("academy-chapter", index),
      title: text(chapter.title, `Capítulo ${index + 1}`),
      objective: text(chapter.objective),
      content: text(chapter.content),
      concepts: texts(chapter.concepts, 16),
      examples: texts(chapter.examples, 12),
    };
  }).filter((chapter) => chapter.content.length > 0);
  if (chapters.length === 0 || !text(value.summary)) {
    throw new Error("O conteúdo gerado está incompleto. Tente novamente.");
  }
  const concepts = (Array.isArray(value.concepts) ? value.concepts : []).slice(0, 40).map((item) => {
    const concept = object(item);
    return { name: text(concept.name), description: text(concept.description), relatedTo: texts(concept.relatedTo, 12) };
  }).filter((concept) => concept.name && concept.description);
  return {
    chapters,
    concepts,
    examples: texts(value.examples, 30),
    summary: text(value.summary),
    review: texts(value.review, 20),
  };
}

function parseExercise(item: unknown, index: number): AcademyExercise {
  const exercise = object(item);
  const allowed = ["multiple-choice", "true-false", "discursive", "code", "practical"] as const;
  const type = allowed.includes(exercise.type as typeof allowed[number])
    ? exercise.type as typeof allowed[number]
    : "discursive";
  return {
    id: id("academy-exercise", index),
    type,
    question: text(exercise.question),
    guidance: text(exercise.guidance),
    answer: text(exercise.answer),
    difficulty: difficulty(exercise.difficulty),
  };
}

function parsePractice(value: JsonObject): AcademyPracticeResult {
  const exercises = (Array.isArray(value.exercises) ? value.exercises : []).slice(0, 20)
    .map(parseExercise).filter((exercise) => exercise.question && exercise.answer);
  const flashcards = (Array.isArray(value.flashcards) ? value.flashcards : []).slice(0, 30).map((item) => {
    const card = object(item);
    return { question: text(card.question), answer: text(card.answer), difficulty: difficulty(card.difficulty) };
  }).filter((card) => card.question && card.answer);
  const quiz = (Array.isArray(value.quiz) ? value.quiz : []).slice(0, 20).flatMap((item) => {
    const question = object(item);
    const alternatives = texts(question.alternatives, 4);
    if (!text(question.question) || alternatives.length !== 4) return [];
    const correctAnswer = Math.max(0, Math.min(3, Math.trunc(Number(question.correctAnswer) || 0)));
    return [{
      question: text(question.question),
      alternatives: alternatives as [string, string, string, string],
      correctAnswer,
      explanation: text(question.explanation),
      difficulty: difficulty(question.difficulty),
    }];
  });
  const trail = Array.isArray(value.trail) ? value.trail.slice(0, 60).map((item, index) => {
    const day = object(item);
    return {
      day: Math.max(1, Math.trunc(Number(day.day) || index + 1)),
      goal: text(day.goal),
      lesson: text(day.lesson),
      exercise: text(day.exercise),
      review: text(day.review),
      checkpoint: text(day.checkpoint) || undefined,
    };
  }).filter((day) => day.goal) : undefined;
  const projectValue = value.project && typeof value.project === "object" && !Array.isArray(value.project)
    ? object(value.project)
    : undefined;
  const project = projectValue ? {
    objective: text(projectValue.objective),
    technologies: texts(projectValue.technologies, 20),
    requirements: texts(projectValue.requirements, 30),
    steps: texts(projectValue.steps, 40),
    challenges: texts(projectValue.challenges, 20),
    checklist: texts(projectValue.checklist, 40),
    completionCriteria: texts(projectValue.completionCriteria, 20),
  } : undefined;
  if (exercises.length === 0 || flashcards.length === 0 || quiz.length === 0) {
    throw new Error("As atividades geradas estão incompletas. Tente novamente.");
  }
  return {
    exercises,
    studyPlan: texts(value.studyPlan, 30),
    flashcards,
    quiz,
    ...(trail?.length ? { trail } : {}),
    ...(project?.objective ? { project } : {}),
  };
}

export const AcademyGenerationParser = {
  parse(stage: AcademyGenerationStage, raw: string) {
    const value = parseJson(raw);
    if (stage === "outline") return parseOutline(value);
    if (stage === "lessons") return parseLessons(value);
    return parsePractice(value);
  },
};

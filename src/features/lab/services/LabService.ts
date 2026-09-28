import { AcademyStorage } from "@/features/academy/storage/AcademyStorage";
import { LearningService } from "@/features/learning/LearningService";
import { StudyEngine } from "@/features/study/services/StudyEngine";
import { MaterialService } from "@/services/material-service";
import type { Material } from "@/types/material";
import { LabStorage } from "../storage/LabStorage";
import type { CreateLabProjectInput, LabExecutionResult, LabLanguage, LabProject } from "../types";
import { TerminalService } from "./TerminalService";

const templates: Record<LabLanguage, string> = {
  javascript: 'const topic = "StudyAI";\nconsole.log(`Olá, ${topic}!`);',
  typescript: 'type Student = { name: string; progress: number };\nconst student: Student = { name: "Gabriel", progress: 0 };\nconsole.log(student);',
  html: '<main class="card">\n  <h1>StudyAI Lab</h1>\n  <p>Edite este conteúdo e visualize ao lado.</p>\n</main>',
  css: 'body { font-family: system-ui; padding: 2rem; background: #f5f7fb; }\n.card { max-width: 32rem; padding: 2rem; border-radius: 1rem; background: white; }',
  sql: 'CREATE TABLE alunos (id INTEGER PRIMARY KEY, nome TEXT, progresso INTEGER);\nINSERT INTO alunos (nome, progresso) VALUES ("Ana", 80), ("Bruno", 65);\nSELECT * FROM alunos ORDER BY progresso DESC;',
  markdown: '# StudyAI Lab\n\nPratique com **Markdown** seguro.\n\n- Editor\n- Preview\n- Persistência',
  mermaid: 'flowchart TD\n  A[Estudar] --> B[Praticar]\n  B --> C[Receber feedback]\n  C --> A',
  python: 'def greet(name: str) -> str:\n    return f"Olá, {name}!"\n\nprint(greet("StudyAI"))',
};

function material(project: LabProject): Material {
  const content = project.files[project.language] ?? "";
  return {
    id: `lab-material-${project.id}`,
    fileId: `lab-material-${project.id}`,
    identity: `lab:${project.id}`,
    name: project.title,
    relativePath: `Laboratório/${project.subject ?? "Estudo livre"}/${project.title}`,
    fileType: "txt",
    mimeType: "application/x-studyai-lab",
    size: new TextEncoder().encode(content).byteLength,
    lastModified: Date.now(),
    importedAt: project.createdAt,
    updatedAt: project.updatedAt,
    progress: project.status === "completed" ? 100 : project.status === "in-progress" ? 50 : 0,
    status: "ready",
    isFavorite: false,
    studyId: project.studyId,
    subject: project.subject,
    topic: project.topic,
    persistentBinary: false,
    sourceType: "lab",
    labProjectId: project.id,
    tags: ["Laboratório", project.language],
  };
}

function matchesExpected(project: LabProject, execution: LabExecutionResult) {
  if (execution.status !== "success") return false;
  const expected = project.exercise.expectedResult.trim().toLocaleLowerCase();
  if (!expected) return true;
  const actual = [...execution.output, ...(execution.rows?.flat().map(String) ?? [])].join(" ").toLocaleLowerCase();
  return actual.includes(expected);
}

export const LabService = {
  template(language: LabLanguage) { return templates[language]; },

  async create(input: CreateLabProjectInput) {
    const now = new Date().toISOString();
    const code = input.exercise?.starterCode || templates[input.language];
    const project: LabProject = {
      id: `lab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: input.title.trim() || "Novo exercício",
      language: input.language,
      files: { [input.language]: code },
      studyId: input.studyId,
      academyStudyId: input.academyStudyId,
      academyContentId: input.academyContentId,
      subject: input.subject,
      topic: input.topic,
      exercise: {
        statement: input.exercise?.statement?.trim() || "Pratique os conceitos usando o editor.",
        language: input.language,
        starterCode: code,
        expectedResult: input.exercise?.expectedResult?.trim() || "",
        hints: input.exercise?.hints ?? [],
        solution: input.exercise?.solution ?? "",
        difficulty: input.exercise?.difficulty ?? "medium",
      },
      status: "draft",
      attempts: 0,
      correctAttempts: 0,
      wrongAttempts: 0,
      practicedSeconds: 0,
      terminal: TerminalService.initial(),
      createdAt: now,
      updatedAt: now,
    };
    await LabStorage.put(project);
    await MaterialService.upsert(material(project));
    if (project.studyId) LearningService.enqueueActivity({ type: "lab", studyId: project.studyId });
    return project;
  },

  async fromAcademy(academyStudyId: string, contentId?: string) {
    const study = await AcademyStorage.get(academyStudyId);
    if (!study) throw new Error("O estudo Academy não foi encontrado.");
    const content = contentId ? study.contents.find((item) => item.id === contentId) : study.contents[0];
    if (!content) throw new Error("Gere o conteúdo do Academy antes de abrir o Laboratório.");
    const exercise = content.exercises.find((item) => item.type === "code" || item.type === "practical") ?? content.exercises[0];
    const technologies = content.project?.technologies.join(" ").toLocaleLowerCase() ?? "";
    const language: LabLanguage = technologies.includes("sql") ? "sql" : technologies.includes("typescript") ? "typescript" : technologies.includes("html") ? "html" : "javascript";
    return this.create({
      title: exercise?.question || `Prática — ${content.title}`,
      language,
      studyId: study.id,
      academyStudyId: study.id,
      academyContentId: content.id,
      subject: study.subject,
      topic: study.topic,
      exercise: exercise ? { statement: exercise.question, expectedResult: exercise.answer, hints: [exercise.guidance], solution: exercise.answer, difficulty: exercise.difficulty } : undefined,
    });
  },

  async save(project: LabProject) {
    const next = { ...project, status: project.status === "draft" ? "in-progress" as const : project.status, startedAt: project.startedAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() };
    await LabStorage.put(next);
    await MaterialService.upsert(material(next));
    return next;
  },

  async recordExecution(project: LabProject, execution: LabExecutionResult, practicedSeconds: number) {
    const correct = matchesExpected(project, execution);
    const next: LabProject = {
      ...project,
      lastResult: execution,
      status: "in-progress",
      attempts: project.attempts + 1,
      correctAttempts: project.correctAttempts + (correct ? 1 : 0),
      wrongAttempts: project.wrongAttempts + (correct ? 0 : 1),
      practicedSeconds: project.practicedSeconds + Math.max(0, Math.round(practicedSeconds)),
      startedAt: project.startedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.save(next);
    if (next.studyId) LearningService.enqueueActivity({ type: "lab", studyId: next.studyId, durationMinutes: practicedSeconds / 60, correctAnswers: correct ? 1 : 0, wrongAnswers: correct ? 0 : 1, score: correct ? 100 : 0 });
    return next;
  },

  async complete(project: LabProject) {
    const now = new Date().toISOString();
    const next = { ...project, status: "completed" as const, completedAt: now, updatedAt: now };
    await LabStorage.put(next);
    await MaterialService.upsert(material(next));
    if (next.studyId) LearningService.enqueueActivity({ type: "lab", studyId: next.studyId, score: next.feedback?.score });
    return next;
  },

  async remove(project: LabProject) {
    await Promise.all([LabStorage.remove(project.id), MaterialService.remove(`lab-material-${project.id}`)]);
  },

  async studies() { return StudyEngine.load(); },
};

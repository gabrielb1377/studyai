import { AcademyStorage } from "@/features/academy/storage/AcademyStorage";
import { LearningService } from "@/features/learning/LearningService";
import { StudyEngine } from "@/features/study/services/StudyEngine";
import { MaterialService } from "@/services/material-service";
import type { Material } from "@/types/material";
import { LabStorage } from "../storage/LabStorage";
import type { CreateLabProjectInput, LabExecutionResult, LabGuidedStep, LabLanguage, LabProject } from "../types";
import { TerminalService } from "./TerminalService";

const templates: Record<LabLanguage, string> = {
  javascript: 'const topic = "StudyAI";\nconsole.log(`Olá, ${topic}!`);',
  typescript: 'type Student = { name: string; progress: number };\nconst student: Student = { name: "Gabriel", progress: 0 };\nconsole.log(student);',
  html: '<main class="card">\n  <h1>StudyAI Lab</h1>\n  <p>Edite este conteúdo e visualize ao lado.</p>\n</main>',
  css: 'body { font-family: system-ui; padding: 2rem; background: #f5f7fb; }\n.card { max-width: 32rem; padding: 2rem; border-radius: 1rem; background: white; }',
  sql: 'CREATE TABLE alunos (id INTEGER PRIMARY KEY, nome TEXT, progresso INTEGER);\nINSERT INTO alunos (nome, progresso) VALUES ("Ana", 80), ("Bruno", 65);\nSELECT * FROM alunos ORDER BY progresso DESC;',
  markdown: '# StudyAI Lab\n\nPratique com **Markdown** e fórmulas em KaTeX:\n\n$$f(x) = ax^2 + bx + c$$\n\n- Editor\n- Preview com fórmulas\n- Persistência',
  mermaid: 'flowchart TD\n  A[Estudar] --> B[Praticar]\n  B --> C[Receber feedback]\n  C --> A',
  math: '# titulo: Função quadrática e raízes\na = 1\nb = -4\nc = 3\nx: -1..5\npasso: 0.5\nf(x) = a*x^2 + b*x + c',
  data: '# titulo: Horas de estudo por semana\n# grafico: barra\nSemana,Horas\nSem 1,6\nSem 2,8\nSem 3,5\nSem 4,10',
  python: 'def greet(name: str) -> str:\n    return f"Olá, {name}!"\n\nprint(greet("StudyAI"))',
};

export type LabPracticePreset = {
  id: string;
  label: string;
  description: string;
  language: LabLanguage;
  defaultTitle: string;
  statement: string;
  expectedResult: string;
  starterCode: string;
  hints: string[];
  solution: string;
  difficulty: "easy" | "medium" | "hard";
  steps: LabGuidedStep[];
};

export const labPracticePresets: readonly LabPracticePreset[] = [
  {
    id: "custom",
    label: "Livre / Padrão da linguagem",
    description: "Comece do zero com o modelo inicial da linguagem escolhida.",
    language: "javascript",
    defaultTitle: "",
    statement: "Pratique os conceitos usando o editor.",
    expectedResult: "",
    starterCode: templates.javascript,
    hints: [],
    solution: "",
    difficulty: "medium",
    steps: [],
  },
  {
    id: "math-function",
    label: "Matemática: Função e raízes",
    description: "Explore f(x), intervalo, ponto mínimo e cruzamentos em zero no gráfico.",
    language: "math",
    defaultTitle: "Análise de função quadrática",
    statement: "Analise $f(x) = ax^2 + bx + c$ no intervalo $[-1, 5]$, identifique o mínimo da parábola e localize suas raízes reais.",
    expectedResult: "Raiz(es)",
    starterCode: templates.math,
    hints: [
      "Altere os coeficientes a, b e c para observar deslocamentos e concavidade.",
      "Observe na tabela e no resumo onde f(x) cruza zero.",
    ],
    solution: "# titulo: Função quadrática e raízes\na = 1\nb = -4\nc = 3\nx: 0..4\npasso: 0.5\nf(x) = a*x^2 + b*x + c",
    difficulty: "easy",
    steps: [
      { id: "step-1", title: "Executar a função inicial e observar o mínimo no gráfico" },
      { id: "step-2", title: "Identificar as duas raízes em x = 1 e x = 3" },
      { id: "step-3", title: "Alterar b para -2 e comparar o novo vértice" },
    ],
  },
  {
    id: "physics-simulation",
    label: "Simulação: Queda livre (Física)",
    description: "Simule altura h(t) = h0 - 0.5*g*t^2 variando parâmetros físicos.",
    language: "math",
    defaultTitle: "Simulação de queda livre",
    statement: "Simule a altura $h(t) = h_0 - \\frac{1}{2}gt^2$ com $h_0 = 45\\text{ m}$ e $g = 9{,}8\\text{ m/s}^2$ até o objeto tocar o solo.",
    expectedResult: "Mínimo",
    starterCode: "# titulo: Altura na queda livre (m)\nh0 = 45\ng = 9.8\nt: 0..3.5\npasso: 0.25\nh(t) = h0 - 0.5*g*t^2",
    hints: [
      "O instante em que h(t) cruza 0 indica o tempo aproximado de queda.",
      "Teste alterar h0 para 80 e aumente o intervalo t.",
    ],
    solution: "# titulo: Altura na queda livre (m)\nh0 = 45\ng = 9.8\nt: 0..3.2\npasso: 0.2\nh(t) = h0 - 0.5*g*t^2",
    difficulty: "medium",
    steps: [
      { id: "step-1", title: "Executar a simulação de t = 0 até t = 3.5 s" },
      { id: "step-2", title: "Encontrar o intervalo onde h(t) atinge o solo (h = 0)" },
      { id: "step-3", title: "Dobrar h0 e verificar o novo tempo de queda" },
    ],
  },
  {
    id: "data-visualization",
    label: "Dados: Estatísticas e gráfico",
    description: "Analise séries CSV ou JSON com média, mediana e gráfico interativo.",
    language: "data",
    defaultTitle: "Análise de desempenho semanal",
    statement: "Organize uma série de dados em CSV, calcule média e mediana e compare o gráfico em barras e em linha.",
    expectedResult: "Média",
    starterCode: templates.data,
    hints: [
      "Você pode trocar '# grafico: barra' por '# grafico: linha' ou alternar direto no preview.",
      "Experimente adicionar uma 5ª semana e observar como a mediana reage.",
    ],
    solution: "# titulo: Horas de estudo por semana\n# grafico: linha\nSemana,Horas\nSem 1,6\nSem 2,8\nSem 3,5\nSem 4,10\nSem 5,11",
    difficulty: "easy",
    steps: [
      { id: "step-1", title: "Executar o dataset inicial e conferir média e mediana" },
      { id: "step-2", title: "Adicionar uma nova linha de medição e reexecutar" },
      { id: "step-3", title: "Alternar a visualização entre barras e linha" },
    ],
  },
  {
    id: "sql-guided",
    label: "SQL: Consulta e filtragem",
    description: "Pratique CREATE TABLE, INSERT, WHERE e ORDER BY em SQLite local.",
    language: "sql",
    defaultTitle: "Consultas SQL com filtro",
    statement: "Crie a tabela de alunos, insira registros e liste apenas os estudantes com progresso maior ou igual a 70, ordenados do maior para o menor.",
    expectedResult: "Ana",
    starterCode: 'CREATE TABLE alunos (id INTEGER PRIMARY KEY, nome TEXT, progresso INTEGER);\nINSERT INTO alunos (nome, progresso) VALUES ("Ana", 85), ("Bruno", 60), ("Clara", 92);\nSELECT nome, progresso FROM alunos WHERE progresso >= 70 ORDER BY progresso DESC;',
    hints: [
      "Use WHERE progresso >= 70 antes de ORDER BY.",
    ],
    solution: 'CREATE TABLE alunos (id INTEGER PRIMARY KEY, nome TEXT, progresso INTEGER);\nINSERT INTO alunos (nome, progresso) VALUES ("Ana", 85), ("Bruno", 60), ("Clara", 92);\nSELECT nome, progresso FROM alunos WHERE progresso >= 70 ORDER BY progresso DESC;',
    difficulty: "easy",
    steps: [
      { id: "step-1", title: "Executar o script SQL e verificar a tabela gerada" },
      { id: "step-2", title: "Incluir um novo aluno na tabela e filtrar pelo critério" },
    ],
  },
];

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
        ...(input.exercise?.steps?.length ? { steps: input.exercise.steps.map((step) => ({ ...step, done: Boolean(step.done) })) } : {}),
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
    const persisted = await LabStorage.get(project.id);
    const next = {
      ...project,
      status: persisted?.status === "completed" ? "completed" as const : project.status === "draft" ? "in-progress" as const : project.status,
      attempts: Math.max(project.attempts, persisted?.attempts ?? 0),
      correctAttempts: Math.max(project.correctAttempts, persisted?.correctAttempts ?? 0),
      wrongAttempts: Math.max(project.wrongAttempts, persisted?.wrongAttempts ?? 0),
      practicedSeconds: Math.max(project.practicedSeconds, persisted?.practicedSeconds ?? 0),
      lastResult: project.lastResult ?? persisted?.lastResult,
      feedback: project.feedback ?? persisted?.feedback,
      startedAt: project.startedAt ?? persisted?.startedAt ?? new Date().toISOString(),
      completedAt: project.completedAt ?? persisted?.completedAt,
      updatedAt: new Date().toISOString(),
    };
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
    const saved = await this.save(next);
    if (saved.studyId) LearningService.enqueueActivity({ type: "lab", studyId: saved.studyId, durationMinutes: practicedSeconds / 60, correctAnswers: correct ? 1 : 0, wrongAnswers: correct ? 0 : 1, score: correct ? 100 : 0 });
    return saved;
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

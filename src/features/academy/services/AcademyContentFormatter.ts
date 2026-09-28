import type { AcademyGeneratedContent } from "../types";

function section(title: string, values: readonly string[]) {
  return values.length ? `\n## ${title}\n\n${values.map((value) => `- ${value}`).join("\n")}` : "";
}

export function academyContentToMarkdown(content: AcademyGeneratedContent) {
  const chapters = content.chapters.map((chapter) => [
    `## ${chapter.title}`,
    chapter.objective ? `**Objetivo:** ${chapter.objective}` : "",
    chapter.content,
    section("Conceitos", chapter.concepts),
    section("Exemplos", chapter.examples),
  ].filter(Boolean).join("\n\n")).join("\n\n");
  const exercises = content.exercises.map((exercise, index) => [
    `### ${index + 1}. ${exercise.question}`,
    exercise.guidance ? `Orientação: ${exercise.guidance}` : "",
    `Resposta: ${exercise.answer}`,
  ].filter(Boolean).join("\n\n")).join("\n\n");
  const trail = content.trail?.map((day) =>
    `### Dia ${day.day}\n\n**Meta:** ${day.goal}\n\n**Aula:** ${day.lesson}\n\n**Exercício:** ${day.exercise}\n\n**Revisão:** ${day.review}${day.checkpoint ? `\n\n**Checkpoint:** ${day.checkpoint}` : ""}`,
  ).join("\n\n");
  const project = content.project ? [
    `**Objetivo:** ${content.project.objective}`,
    section("Tecnologias", content.project.technologies),
    section("Requisitos", content.project.requirements),
    section("Etapas", content.project.steps),
    section("Desafios", content.project.challenges),
    section("Checklist", content.project.checklist),
    section("Critérios de conclusão", content.project.completionCriteria),
  ].join("\n\n") : "";
  return [
    `# ${content.title}`,
    `## Objetivo\n\n${content.objective}`,
    section("Pré-requisitos", content.prerequisites),
    chapters,
    section("Exemplos adicionais", content.examples),
    exercises ? `## Exercícios\n\n${exercises}` : "",
    `## Resumo\n\n${content.summary}`,
    section("Revisão", content.review),
    section("Plano de estudos", content.studyPlan),
    trail ? `## Trilha\n\n${trail}` : "",
    project ? `## Projeto prático\n\n${project}` : "",
    section("Próximos passos", content.nextSteps),
  ].filter(Boolean).join("\n\n");
}

export function academyContentFileStem(title: string) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "material-academy";
}

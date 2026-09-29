import { StorageManager } from "@/lib/storage/StorageManager";
import type { Material } from "@/types/material";
import type { StudyNote } from "@/types/note";
import type { StudySummary } from "@/types/summary";
import type { Flashcard } from "@/types/flashcard";
import type { KnowledgeGraph } from "@/features/semantic/types";
import { CollaborationClient } from "@/features/collaboration/CollaborationClient";
import type { CollaborationComment, StudyRoom } from "@/features/collaboration/types";
import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import type { LabProject } from "@/features/lab/types";

export type GlobalSearchCategory = "material" | "note" | "summary" | "flashcard" | "quiz" | "concept" | "knowledge" | "room" | "comment";

export type GlobalSearchResult = {
  id: string;
  category: GlobalSearchCategory;
  title: string;
  preview: string;
  score: number;
  href: string;
};

type SearchSnapshot = {
  materials: Material[];
  notes: StudyNote[];
  summaries: StudySummary[];
  flashcards: Flashcard[];
  quizzes: Array<Record<string, unknown>>;
  graphs: KnowledgeGraph[];
  contents: ExtractedContent[];
  labProjects: LabProject[];
  rooms: StudyRoom[];
  comments: Array<CollaborationComment & { roomName: string }>;
};

let cache: { value: SearchSnapshot; expiresAt: number } | undefined;

const synonyms: Record<string, string[]> = {
  pdf: ["documento", "arquivo", "material"],
  nota: ["anotacao", "anotações"],
  resumo: ["sintese", "revisao"],
  quiz: ["questao", "exercicio", "prova"],
  conceito: ["termo", "definicao"],
  academy: ["estudo livre", "trilha", "projeto pratico", "material gerado"],
  laboratorio: ["lab", "exercicio", "codigo", "pratica"],
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function expandedTerms(query: string) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  return [...new Set(tokens.flatMap((token) => [token, ...(synonyms[token] ?? [])].map(normalize)))];
}

function matchScore(text: string, terms: readonly string[]) {
  const normalized = normalize(text);
  const matched = terms.filter((term) => normalized.includes(term));
  if (matched.length === 0) return 0;
  const exact = normalized.includes(terms.join(" ")) ? 40 : 0;
  const prefix = matched.some((term) => normalized.startsWith(term)) ? 20 : 0;
  return Math.min(100, exact + prefix + matched.length / terms.length * 40);
}

function studyHref(studyId: unknown, tab: string, materialId?: string) {
  const query = new URLSearchParams();
  if (typeof studyId === "string") query.set("tema", studyId);
  query.set("aba", tab);
  if (materialId) query.set("arquivo", materialId);
  return `/estudo?${query.toString()}`;
}

async function snapshot(): Promise<SearchSnapshot> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  const [materials, notes, summaries, flashcards, quizzes, graphs, contents, labProjects] = await Promise.all([
    StorageManager.getAll<Material>("documents"),
    StorageManager.getAll<StudyNote>("notes"),
    StorageManager.getAll<StudySummary>("summaries"),
    StorageManager.getAll<Flashcard>("flashcards"),
    StorageManager.getAll<Record<string, unknown>>("quizzes"),
    StorageManager.getAll<KnowledgeGraph>("knowledge"),
    StorageManager.getAll<ExtractedContent>("contents"),
    StorageManager.getAll<LabProject>("lab"),
  ]);
  const rooms = await CollaborationClient.list().then((result) => result.rooms).catch(() => []);
  const roomSnapshots = await Promise.all(rooms.map((room) => CollaborationClient.room(room.id).catch(() => null)));
  const comments = roomSnapshots.flatMap((snapshot) => snapshot ? snapshot.comments.map((comment) => ({ ...comment, roomName: snapshot.room.name })) : []);
  const value = { materials, notes, summaries, flashcards, quizzes, graphs, contents, labProjects, rooms, comments };
  cache = { value, expiresAt: Date.now() + 5_000 };
  return value;
}

function preview(value: string, length = 130) {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

export const GlobalSearchService = {
  clearCache() { cache = undefined; },

  async search(query: string, limit = 24): Promise<GlobalSearchResult[]> {
    const terms = expandedTerms(query);
    if (terms.length === 0) return [];
    const data = await snapshot();
    const results: GlobalSearchResult[] = [];
    const add = (result: Omit<GlobalSearchResult, "score">, searchable: string) => {
      const score = matchScore(searchable, terms);
      if (score > 0) results.push({ ...result, score });
    };

    data.materials.forEach((material) => {
      const content = data.contents.find((item) => item.fileId === material.fileId);
      const labProject = material.labProjectId ? data.labProjects.find((item) => item.id === material.labProjectId) : undefined;
      const labText = labProject ? [labProject.title, labProject.exercise.statement, labProject.exercise.expectedResult, labProject.exercise.solution, ...labProject.exercise.hints, ...Object.values(labProject.files)].join(" ") : "";
      const context = [material.name, material.course, material.semester, material.subject, material.topic, material.institution, material.professor, material.relativePath, material.sourceType, material.academyMaterialKind, ...(material.tags ?? []), ...(content?.metadata.keywords ?? []), ...(content?.metadata.subtopics ?? []), ...(content?.metadata.chapters?.map((chapter) => chapter.title) ?? []), content?.extractedText.slice(0, 250_000), labText].filter(Boolean).join(" ");
      const href = material.sourceType === "lab"
        ? `/lab?exercise=${encodeURIComponent(material.labProjectId ?? "")}`
        : material.sourceType === "ai-generated"
          ? `/academy?estudo=${encodeURIComponent(material.academyStudyId ?? material.studyId ?? "")}${material.academyContentId ? `&conteudo=${encodeURIComponent(material.academyContentId)}` : ""}`
          : studyHref(material.studyId, "material", material.id);
      add({ id: material.id, category: "material", title: material.name, preview: preview(content?.extractedText || labText || [material.subject, material.topic, material.relativePath].filter(Boolean).join(" · ")), href }, context);
    });
    data.notes.forEach((note) => add({ id: note.id, category: "note", title: note.title, preview: preview(note.content), href: studyHref(note.studyId, "notes") }, `${note.title} ${note.content}`));
    data.summaries.forEach((summary) => add({ id: summary.id, category: "summary", title: summary.title, preview: preview(summary.content), href: studyHref(summary.studyId, "summaries") }, `${summary.title} ${summary.content}`));
    data.flashcards.forEach((card) => add({ id: card.id, category: "flashcard", title: card.question, preview: preview(card.answer), href: studyHref(card.studyId, "flashcards") }, `${card.question} ${card.answer} ${card.difficulty}`));
    data.quizzes.forEach((quiz, index) => {
      const title = typeof quiz.question === "string" ? quiz.question : `Quiz ${index + 1}`;
      const searchable = [title, quiz.explanation, ...(Array.isArray(quiz.alternatives) ? quiz.alternatives : [])].filter((value): value is string => typeof value === "string").join(" ");
      add({ id: typeof quiz.id === "string" ? quiz.id : `quiz-${index}`, category: "quiz", title, preview: preview(searchable), href: studyHref(quiz.studyId, "quiz") }, searchable);
    });
    data.graphs.forEach((graph) => {
      graph.concepts.forEach((concept) => add({ id: concept.id, category: "concept", title: concept.name, preview: preview(concept.description), href: studyHref(concept.studyId, "knowledge") }, [concept.name, concept.description, ...concept.aliases, ...concept.keywords].join(" ")));
      graph.relations.forEach((relation) => {
        const source = graph.concepts.find((concept) => concept.id === relation.sourceId);
        const target = graph.concepts.find((concept) => concept.id === relation.targetId);
        if (!source || !target) return;
        add({ id: relation.id, category: "knowledge", title: `${source.name} → ${target.name}`, preview: preview(relation.evidence), href: studyHref(graph.studyId, "knowledge") }, `${source.name} ${target.name} ${relation.kind} ${relation.evidence}`);
      });
    });
    data.rooms.forEach((room) => add({ id: room.id, category: "room", title: room.name, preview: preview(room.description || (room.kind === "classroom" ? "Turma" : "Sala de estudo")), href: `/salas?room=${encodeURIComponent(room.id)}` }, `${room.name} ${room.description} ${room.kind}`));
    data.comments.forEach((comment) => add({ id: comment.id, category: "comment", title: `Comentário em ${comment.roomName}`, preview: preview(comment.content), href: `/salas?room=${encodeURIComponent(comment.roomId)}&tab=discussion` }, `${comment.roomName} ${comment.authorName} ${comment.content}`));

    return results.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "pt-BR")).slice(0, limit);
  },
};

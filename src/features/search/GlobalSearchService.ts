import { StorageManager } from "@/lib/storage/StorageManager";
import type { Material } from "@/types/material";
import type { StudyNote } from "@/types/note";
import type { StudySummary } from "@/types/summary";
import type { Flashcard } from "@/types/flashcard";
import type { KnowledgeGraph } from "@/features/semantic/types";

export type GlobalSearchCategory = "material" | "note" | "summary" | "flashcard" | "quiz" | "concept" | "knowledge";

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
};

let cache: { value: SearchSnapshot; expiresAt: number } | undefined;

const synonyms: Record<string, string[]> = {
  pdf: ["documento", "arquivo", "material"],
  nota: ["anotacao", "anotações"],
  resumo: ["sintese", "revisao"],
  quiz: ["questao", "exercicio", "prova"],
  conceito: ["termo", "definicao"],
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
  if (materialId) query.set("material", materialId);
  return `/estudo?${query.toString()}`;
}

async function snapshot(): Promise<SearchSnapshot> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  const [materials, notes, summaries, flashcards, quizzes, graphs] = await Promise.all([
    StorageManager.getAll<Material>("documents"),
    StorageManager.getAll<StudyNote>("notes"),
    StorageManager.getAll<StudySummary>("summaries"),
    StorageManager.getAll<Flashcard>("flashcards"),
    StorageManager.getAll<Record<string, unknown>>("quizzes"),
    StorageManager.getAll<KnowledgeGraph>("knowledge"),
  ]);
  const value = { materials, notes, summaries, flashcards, quizzes, graphs };
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

    data.materials.forEach((material) => add({ id: material.id, category: "material", title: material.name, preview: preview([material.subject, material.topic, material.relativePath, ...(material.tags ?? [])].filter(Boolean).join(" · ")), href: studyHref(material.studyId, "material", material.id) }, [material.name, material.subject, material.topic, material.relativePath, ...(material.tags ?? [])].filter(Boolean).join(" ")));
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

    return results.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "pt-BR")).slice(0, limit);
  },
};

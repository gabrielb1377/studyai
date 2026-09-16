import type { DocumentSection, ExtractionMetadata } from "./ExtractionTypes";

const STOP_WORDS = new Set([
  "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos", "e", "em",
  "entre", "essa", "esse", "esta", "este", "foi", "mais", "na", "nas", "no", "nos", "o",
  "os", "ou", "para", "por", "que", "se", "sem", "ser", "sua", "suas", "um", "uma",
  "the", "and", "for", "from", "into", "that", "this", "with",
]);

const SUBJECT_HINTS: Array<{ subject: string; terms: string[] }> = [
  { subject: "Algoritmos e Estruturas de Dados", terms: ["algoritmo", "vetor", "lista", "pilha", "fila", "recursao"] },
  { subject: "Banco de Dados", terms: ["banco", "dados", "sql", "tabela", "relacional", "consulta"] },
  { subject: "Arquitetura de Computadores", terms: ["arquitetura", "processador", "memoria", "binario", "dados"] },
  { subject: "Programação", terms: ["programacao", "codigo", "java", "python", "funcao", "classe"] },
  { subject: "Matemática", terms: ["matematica", "equacao", "calculo", "matriz", "funcao", "vetor"] },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function wordsFrom(text: string) {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) ?? [];
}

function detectLanguage(text: string) {
  const words = wordsFrom(text).map((word) => normalize(word));
  if (words.length < 8) return undefined;
  const portuguese = new Set(["de", "do", "da", "em", "para", "que", "uma", "como", "com"]);
  const english = new Set(["the", "of", "in", "to", "for", "that", "with", "and"]);
  const pt = words.filter((word) => portuguese.has(word)).length;
  const en = words.filter((word) => english.has(word)).length;
  if (pt === en) return undefined;
  return pt > en ? "pt-BR" : "en";
}

function extractKeywords(text: string) {
  const frequencies = new Map<string, { label: string; count: number }>();
  for (const label of wordsFrom(text)) {
    const term = normalize(label);
    if (term.length < 4 || STOP_WORDS.has(term) || /^\d+$/.test(term)) continue;
    const current = frequencies.get(term);
    frequencies.set(term, { label, count: (current?.count ?? 0) + 1 });
  }
  return [...frequencies.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 10)
    .map(({ label }) => label.toLocaleLowerCase("pt-BR"));
}

function inferSubject(text: string, fallback?: string) {
  const normalized = normalize(text);
  const ranked = SUBJECT_HINTS.map((candidate) => ({
    ...candidate,
    score: candidate.terms.filter((term) => normalized.includes(term)).length,
  })).sort((left, right) => right.score - left.score);
  return ranked[0]?.score ? ranked[0].subject : fallback;
}

function cleanFileTitle(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function summaryPreview(text: string) {
  const firstParagraph = text.split(/\n{2,}/).find((paragraph) => paragraph.trim().length > 40) ?? text;
  const sentences = firstParagraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const preview = sentences.slice(0, 2).join(" ").replace(/\s+/g, " ").trim();
  return preview.length > 360 ? `${preview.slice(0, 359).trimEnd()}…` : preview;
}

export const DocumentAnalyzer = {
  analyze({
    fileName,
    text,
    sections = [],
    metadata,
    fallbackSubject,
  }: {
    fileName: string;
    text: string;
    sections?: readonly DocumentSection[];
    metadata: ExtractionMetadata;
    fallbackSubject?: string;
  }): Partial<ExtractionMetadata> {
    const words = wordsFrom(text);
    const headings = sections.filter((section) => section.type === "title" || section.type === "heading");
    const title = headings[0]?.text || cleanFileTitle(fileName);
    const topic = headings[1]?.text || title;
    const subtopics = headings.slice(1, 9).map((section) => section.text)
      .filter((value, index, values) => values.indexOf(value) === index);
    const language = metadata.language ?? detectLanguage(text);

    return {
      title,
      subject: inferSubject(`${fileName} ${title} ${text.slice(0, 4_000)}`, fallbackSubject),
      topic,
      subtopics,
      keywords: extractKeywords(text),
      summaryPreview: summaryPreview(text),
      language,
      pageCount: metadata.pageCount,
      wordCount: words.length,
      readingTimeMinutes: words.length ? Math.max(1, Math.ceil(words.length / 200)) : 0,
      createdAt: metadata.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },

  detectLanguage,
};

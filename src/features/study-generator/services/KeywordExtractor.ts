import { wordsFrom } from "./ReadingTimeCalculator";

const STOP_WORDS = new Set([
  "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos", "e", "em",
  "entre", "essa", "esse", "esta", "este", "foi", "mais", "na", "nas", "no", "nos", "o",
  "os", "ou", "para", "por", "que", "se", "sem", "ser", "sua", "suas", "um", "uma",
  "the", "and", "for", "from", "into", "that", "this", "with", "aula", "pagina", "unidade",
  "capitulo", "secao", "introducao", "conclusao", "referencias", "objetivos", "atividades",
]);

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export const KeywordExtractor = {
  extract(text: string, limit = 10) {
    const frequencies = new Map<string, { label: string; count: number }>();
    for (const label of wordsFrom(text)) {
      const term = normalize(label);
      if (term.length < 4 || STOP_WORDS.has(term) || /^\d+$/.test(term)) continue;
      const current = frequencies.get(term);
      frequencies.set(term, { label: label.toLocaleLowerCase("pt-BR"), count: (current?.count ?? 0) + 1 });
    }
    return [...frequencies.entries()]
      .sort(([leftKey, left], [rightKey, right]) => right.count - left.count || leftKey.localeCompare(rightKey))
      .slice(0, limit)
      .map(([, value]) => value.label);
  },
};


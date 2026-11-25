import type { ExtractedContent, ExtractedPage } from "@/features/extraction/ExtractionTypes";

const question = /^\s*(?:quest(?:ão|ao)\s*(\d{1,4})\s*[.):–-]?|(?:exercício\s+)?(\d{1,4})[.):])\s*(.*)$/iu;
const alternative = /^\s*(?:\(([A-E])\)|([A-E])[.):–-])\s*(.*)$/iu;
const answerKey = /^\s*(?:gabarito|resposta\s+correta)\b/iu;
const formula = /[√∫∑πθλΔαβγ²³⁰¹⁴-⁹₀-₉=×÷±≤≥^]|\d\s*[/⁄]\s*\d/u;

export function uncertainExtractionLines(text: string) {
  return text.split(/\r?\n/).flatMap((line, index) =>
    formula.test(line) || /[�□]/u.test(line) ? [index + 1] : []);
}

export function pageNeedsTutorReview(page: ExtractedPage) {
  return !page.edited && (page.method === "ocr" || page.status !== "ready" || page.needsOcr ||
    uncertainExtractionLines(page.text).length > 0);
}

export function contentNeedsTutorReview(content: ExtractedContent) {
  return content.pages?.length
    ? content.pages.some(pageNeedsTutorReview)
    : Boolean(content.metadata.ocrPerformed);
}

export type DetectedExercise = {
  page: number;
  number: string;
  firstLine: number;
  lastLine: number;
  statement: string;
  alternatives: Array<{ label: string; text: string }>;
};

export function detectExercises(text: string, page: number): DetectedExercise[] {
  const lines = text.split(/\r?\n/);
  const starts = lines.flatMap((line, index) => question.test(line) ? [index] : []);
  return starts.flatMap((start, index) => {
    const heading = lines[start].match(question)!;
    const statement = [heading[3]];
    const alternatives: DetectedExercise["alternatives"] = [];
    let lastLine = start + 1;
    for (let line = start + 1; line < (starts[index + 1] ?? lines.length); line++) {
      if (answerKey.test(lines[line])) break;
      const option = lines[line].match(alternative);
      const current = alternatives.at(-1);
      if (option) alternatives.push({ label: (option[1] ?? option[2]).toUpperCase(), text: option[3] });
      else if (current) current.text += "\n" + lines[line];
      else statement.push(lines[line]);
      if (lines[line].trim()) lastLine = line + 1;
    }
    const labels = alternatives.map((option) => option.label).join("");
    if (!statement.join("\n").trim() || !/^(AB|ABC|ABCD|ABCDE)$/.test(labels) ||
      alternatives.some((option) => !option.text.trim())) return [];
    return [{
      page, number: heading[1] ?? heading[2], firstLine: start + 1, lastLine,
      statement: statement.join("\n").trim(),
      alternatives: alternatives.map((option) => ({ ...option, text: option.text.trim() })),
    }];
  });
}

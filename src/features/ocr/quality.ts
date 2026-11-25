import type { OcrMode, PageQuality, QualityLevel } from "../extraction/ExtractionTypes";

const ANALYZE_SAMPLE = 20_000;
const COMMON_PUNCTUATION = /[.,;:!?%°ºª()\[\]{}\-–—/\\'"“”‘’…+*=<>|&@#_~$€£¥\n\r\t ]/u;
const LETTER = /\p{L}/u;
const ALPHANUMERIC = /[\p{L}\p{N}]/u;

export function countLetters(text: string) {
  return Array.from(text.slice(0, ANALYZE_SAMPLE)).filter((character) => LETTER.test(character)).length;
}

export function unknownQuality(): PageQuality {
  return { level: "unknown", issues: ["Página não processada."] };
}

export function assessTextQuality(text: string): PageQuality {
  const trimmed = text.trim();
  if (!trimmed) return { level: "poor", issues: ["Nenhum texto foi extraído desta página."] };

  const characters = Array.from(trimmed.slice(0, ANALYZE_SAMPLE));
  const letters = characters.filter((character) => LETTER.test(character)).length;
  const replacement = characters.filter((character) => character === "\uFFFD").length;
  const control = characters.filter((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (code < 32 && character !== "\n" && character !== "\t" && character !== "\r") || code === 127;
  }).length;
  const suspicious = characters.filter((character) => !ALPHANUMERIC.test(character) && !COMMON_PUNCTUATION.test(character)).length;
  const repeated = (trimmed.match(/(.)\1{5,}/gu) ?? []).length;
  const issues: string[] = [];

  if (letters < 24) issues.push("Texto muito curto para confirmar a extração.");
  if (replacement > 0 || control > 0) issues.push("Há caracteres ilegíveis no texto extraído.");
  if (suspicious / Math.max(1, characters.length) > 0.18) issues.push("Alta proporção de símbolos não textuais.");
  if (repeated > 2) issues.push("Foram detectadas sequências repetidas de caracteres.");
  if (letters >= 24 && !/[.!?;:]/.test(trimmed) && !/[-•|]\s/.test(trimmed)) {
    issues.push("O texto não contém pontuação de frase; confira a segmentação.");
  }

  const level: QualityLevel = letters < 12 || replacement > 0 || control > 0 || suspicious / Math.max(1, characters.length) > 0.3
    ? "poor"
    : issues.length > 0
      ? "fair"
      : "good";

  return { level, issues };
}

export type OcrDecisionInput = {
  mode: OcrMode;
  text: string;
  hasImages: boolean;
  imageAreaRatio: number;
};

export function shouldRunOcr({ mode, text, hasImages, imageAreaRatio }: OcrDecisionInput) {
  if (mode === "native") return false;
  if (mode === "force") return true;

  const quality = assessTextQuality(text);
  if (quality.level === "poor") return true;
  if (!text.trim()) return true; // Nenhum texto nativo
  if (hasImages && imageAreaRatio >= 0.5 && countLetters(text) < 250) return true; // Página escaneada com pouco texto
  return false;
}

const LEVEL_WEIGHT: Record<QualityLevel, number> = {
  unknown: 0,
  poor: 1,
  fair: 2,
  good: 3,
};

export function documentQuality(pages: readonly { quality: PageQuality; text: string }[]): QualityLevel {
  const evaluated = pages.filter((page) => page.text.trim().length > 0);
  if (evaluated.length === 0) return "poor";
  return evaluated.reduce<QualityLevel>((worst, page) => (
    LEVEL_WEIGHT[page.quality.level] < LEVEL_WEIGHT[worst] ? page.quality.level : worst
  ), "good");
}

export function qualityLabel(level: QualityLevel) {
  if (level === "good") return "Boa";
  if (level === "fair") return "Revisar";
  if (level === "poor") return "Baixa";
  return "Não avaliada";
}

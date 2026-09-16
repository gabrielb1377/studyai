const INVALID_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const BULLET_PATTERN = /^[\s]*[•●▪◦‣⁃]\s*/;
const NUMBERED_LIST_PATTERN = /^[\s]*(\d+)[.)]\s+/;

function isHeadingLike(line: string) {
  const letters = line.replace(/[^\p{L}]/gu, "");
  return line.length >= 4 && line.length <= 100 && letters.length >= 3 &&
    letters === letters.toLocaleUpperCase("pt-BR") && !/[.!?]$/.test(line);
}

function normalizeLine(line: string) {
  return line
    .replace(INVALID_CONTROL_CHARACTERS, "")
    .replace(/[\t\u00A0]+/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(BULLET_PATTERN, "- ")
    .replace(NUMBERED_LIST_PATTERN, "$1. ")
    .trim();
}

function joinWrappedLines(lines: readonly string[]) {
  const paragraphs: string[] = [];
  let current = "";

  for (const line of lines) {
    if (!line) {
      if (current) paragraphs.push(current.trim());
      current = "";
      continue;
    }

    const structural = /^([#>|-]|\d+[.)]\s)/.test(line) || isHeadingLike(line);
    const previousEndsSentence = /[.!?:;]$/.test(current) || isHeadingLike(current);
    if (!current || structural || previousEndsSentence) {
      if (current) paragraphs.push(current.trim());
      current = line;
    } else {
      current += ` ${line}`;
    }
  }
  if (current) paragraphs.push(current.trim());
  return paragraphs.join("\n\n");
}

export const TextNormalizationService = {
  normalize(value: string) {
    const unicode = value
      .normalize("NFKC")
      .replace(/\u00AD/g, "")
      .replace(/\r\n?/g, "\n")
      .replace(/([\p{L}\p{N}])-\n(?=[\p{Ll}\p{N}])/gu, "$1")
      .replace(/\n{3,}/g, "\n\n");

    return joinWrappedLines(unicode.split("\n").map(normalizeLine)).trim();
  },

  normalizeSentence(value: string) {
    const normalized = this.normalize(value).replace(/\n+/g, " ").trim();
    if (!normalized) return "";
    const sentence = normalized.charAt(0).toLocaleUpperCase("pt-BR") + normalized.slice(1);
    return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
  },

  toSections(value: string) {
    return this.normalize(value).split(/\n{2,}/).filter(Boolean).map((text, index) => {
      const markdownHeading = text.match(/^(#{1,6})\s+(.+)$/);
      if (markdownHeading) {
        return {
          type: markdownHeading[1].length === 1 ? "title" as const : "heading" as const,
          text: markdownHeading[2],
          level: markdownHeading[1].length,
        };
      }
      if (/^(-|\d+[.)])\s+/.test(text)) return { type: "list" as const, text };
      if (isHeadingLike(text)) {
        return {
          type: index === 0 ? "title" as const : "heading" as const,
          text,
          level: index === 0 ? 1 : 2,
        };
      }
      return { type: "paragraph" as const, text };
    });
  },
};

/**
 * Preparação de texto pedagógico para narração (TTS).
 *
 * O objetivo é transformar conteúdo textual (Markdown, listas, código, fórmulas)
 * em uma sequência natural de fala, preservando o significado e a estrutura
 * sem que o aluno precise ler a tela.
 */

export type NarrationSegment = {
  id: string;
  kind: "paragraph" | "list" | "code" | "formula" | "quote" | "heading";
  text: string;
  spoken: string;
};

export type NarrationDocument = {
  segments: NarrationSegment[];
  spokenText: string;
};

const URL_PATTERN = /https?:\/\/\S+/g;
const MAX_URL_LENGTH = 40;

/** Remove blocos de código preservando a ideia principal do trecho. */
function narrateCode(value: string, language = "") {
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return "";
  const label = language && language !== "mermaid" ? `Código ${language}. ` : "";
  const head = lines[0].length > 80 ? `${lines[0].slice(0, 80)}` : lines[0];
  if (lines.length === 1) return `${label}${head}.`;
  return `${label}${head}. O trecho continua com mais ${lines.length - 1} ${lines.length - 1 === 1 ? "linha" : "linhas"} de código.`;
}

/** Converte fórmulas LaTeX em uma leitura compreensível. */
function narrateFormula(value: string) {
  const cleaned = value
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1 dividido por $2")
    .replace(/\\sqrt\{([^{}]*)\}/g, "raiz quadrada de $1")
    .replace(/\\sum/g, "somatório")
    .replace(/\\int/g, "integral")
    .replace(/\\pi/g, "pi")
    .replace(/\\cdot/g, "multiplicado por")
    .replace(/\\times/g, "multiplicado por")
    .replace(/\\leq/g, "menor ou igual a")
    .replace(/\\geq/g, "maior ou igual a")
    .replace(/\\neq/g, "diferente de")
    .replace(/\\pm/g, "mais ou menos")
    .replace(/\\infty/g, "infinito")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? `Fórmula: ${cleaned}.` : "";
}

/** Converte marcadores Markdown em linguagem falada. */
function narrateInline(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt: string) => (alt ? `Imagem: ${alt}.` : ""))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, href: string) => {
      if (href.length > MAX_URL_LENGTH) return label;
      return label;
    })
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(URL_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Converte títulos em uma frase falada. */
function narrateHeading(value: string, level: number) {
  const text = narrateInline(value);
  if (!text) return "";
  if (level <= 1) return `Tópico: ${text}.`;
  if (level === 2) return `Seção: ${text}.`;
  return `Tópico: ${text}.`;
}

function narrateListItem(value: string) {
  const text = narrateInline(value);
  return text ? `Item: ${text}.` : "";
}

/**
 * Converte um texto Markdown em segmentos narráveis.
 * O texto original permanece intacto para leitura na tela.
 */
export function prepareNarration(source: string): NarrationDocument {
  const segments: NarrationSegment[] = [];
  if (!source?.trim()) return { segments, spokenText: "" };

  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    // Bloco de código
    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3).trim().split(/\s+/)[0] ?? "";
      const buffer: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        buffer.push(lines[index]);
        index += 1;
      }
      index += 1;
      const spoken = narrateCode(buffer.join("\n"), language);
      if (spoken) {
        segments.push({ id: `seg-${segments.length}`, kind: "code", text: buffer.join("\n").trim(), spoken });
      }
      continue;
    }

    // Fórmulas (bloco em uma linha ou multilinha)
    if (line.includes("$$")) {
      const trimmed = line.trim();
      const singleLine = trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4;
      if (singleLine) {
        const spoken = narrateFormula(trimmed.slice(2, -2));
        if (spoken) {
          segments.push({ id: `seg-${segments.length}`, kind: "formula", text: trimmed.slice(2, -2).trim(), spoken });
        }
        index += 1;
        continue;
      }

      const buffer: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().endsWith("$$")) {
        buffer.push(lines[index]);
        index += 1;
      }
      index += 1;
      const spoken = narrateFormula(buffer.join(" "));
      if (spoken) {
        segments.push({ id: `seg-${segments.length}`, kind: "formula", text: buffer.join(" ").trim(), spoken });
      }
      continue;
    }

    // Tabela
    if (line.includes("|") && lines[index + 1]?.includes("-")) {
      const buffer: string[] = [line];
      index += 2;
      while (index < lines.length && lines[index].includes("|")) {
        buffer.push(lines[index]);
        index += 1;
      }
      const cells = buffer
        .flatMap((row) => row.split("|").map((cell) => narrateInline(cell)).filter(Boolean));
      const spoken = cells.length ? `Tabela: ${cells.join(". ")}.` : "";
      if (spoken) {
        segments.push({ id: `seg-${segments.length}`, kind: "list", text: buffer.join("\n"), spoken });
      }
      continue;
    }

    // Citação
    if (line.trim().startsWith(">")) {
      const text = narrateInline(line.replace(/^\s*>\s?/, ""));
      if (text) {
        segments.push({ id: `seg-${segments.length}`, kind: "quote", text: line.trim().replace(/^>\s?/, ""), spoken: `Citação: ${text}.` });
      }
      index += 1;
      continue;
    }

    // Título
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const spoken = narrateHeading(heading[2], level);
      if (spoken) {
        segments.push({ id: `seg-${segments.length}`, kind: "heading", text: heading[2].trim(), spoken });
      }
      index += 1;
      continue;
    }

    // Item de lista
    const listItem = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.*)$/);
    if (listItem) {
      const spoken = narrateListItem(listItem[1]);
      if (spoken) {
        segments.push({ id: `seg-${segments.length}`, kind: "list", text: listItem[1].trim(), spoken });
      }
      index += 1;
      continue;
    }

    // Parágrafo
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const buffer: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      if (
        !current.trim() ||
        current.trim().startsWith("```") ||
        current.trim().startsWith("$$") ||
        current.match(/^(#{1,6})\s+/) ||
        current.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/) ||
        current.trim().startsWith(">") ||
        (current.includes("|") && lines[index + 1]?.includes("-"))
      ) {
        break;
      }
      buffer.push(current);
      index += 1;
    }

    const text = buffer.join(" ").trim();
    const spoken = narrateInline(text);
    if (spoken) {
      segments.push({ id: `seg-${segments.length}`, kind: "paragraph", text, spoken });
    }
  }

  return {
    segments,
    spokenText: segments.map((segment) => segment.spoken).join(" "),
  };
}

/**
 * Converte um texto de IA em fala pronta, preservando termos técnicos.
 * Usa o mesmo pipeline do StudentAI para material já estruturado.
 */
export function prepareNarrationText(source: string): string {
  return prepareNarration(source).spokenText;
}

/** Indica se o texto é narrável (não vazio após preparo). */
export function isNarratable(source: string): boolean {
  return prepareNarrationText(source).length > 0;
}

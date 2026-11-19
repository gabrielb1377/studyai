/**
 * Modelo canônico de exportação do Academy Studio.
 *
 * Converte o `StudioDocument` estruturado em um modelo neutro de blocos,
 * preservando ordem, identificadores estáveis e customizações. O modelo é a
 * única entrada dos renderizadores PDF e PPTX — ele não regenera conteúdo por
 * IA e não altera o documento-fonte.
 */

import { sanitizeMarkdown } from "../sanitize";
import { toMermaidSource } from "@/features/diagrams/render/svg";
import type { DiagramDocument } from "@/features/diagrams/types";
import type { DocumentSection, Slide, StudioDocument } from "../types";

export type ExportBlock =
  | { kind: "heading"; id: string; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; id: string; text: string }
  | { kind: "list"; id: string; items: string[]; ordered: boolean }
  | { kind: "code"; id: string; language: string; code: string }
  | { kind: "table"; id: string; header: string[]; rows: string[][] }
  | { kind: "example"; id: string; text: string }
  | { kind: "exercise"; id: string; question: string; guidance?: string; answer?: string }
  | { kind: "summary"; id: string; text: string }
  | { kind: "quote"; id: string; text: string }
  | { kind: "diagram"; id: string; language: string; source: string; diagram?: DiagramDocument };

export type ExportSection = {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  blocks: ExportBlock[];
};

export type ExportDocumentModel = {
  documentId: string;
  version: number;
  template: string;
  title: string;
  subtitle?: string;
  description?: string;
  author?: string;
  date?: string;
  subject?: string;
  keywords: string[];
  cover: {
    enabled: boolean;
    title: string;
    subtitle: string;
    author: string;
    date: string;
  };
  tableOfContents: { enabled: boolean; depth: 1 | 2 | 3 };
  headerFooter: { enabled: boolean; headerText: string; footerText: string; showPageNumbers: boolean };
  pageNumbering: string;
  sections: ExportSection[];
};

export type ExportSlideModel = {
  id: string;
  layout: Slide["layout"];
  title: string;
  blocks: ExportBlock[];
  notes?: string;
  background?: string;
  diagram?: DiagramDocument;
};

export type ExportDeckModel = {
  documentId: string;
  version: number;
  template: string;
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  slides: ExportSlideModel[];
  headerFooter: { enabled: boolean; headerText: string; footerText: string; showPageNumbers: boolean };
};

/** Marcador interno usado para reservar blocos de código antes da análise. */
const CODE_MARKER = "%%studio-code-";
const CODE_MARKER_PATTERN = /^%%studio-code-(\d+)$/;

function stripInline(value: string): string {
  return value
    .replace(/!\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*/g, "$1$2")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .trim();
}

function splitTableRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => stripInline(cell));
}

function isTableDivider(line: string): boolean {
  return line.includes("-") && /^\s*\|?[\s:|-]*-{2,}[\s:|-]*$/.test(line);
}

/** Converte Markdown em blocos normalizados, sem dependência de IA. */
export function parseMarkdownBlocks(markdown: string, prefix: string): ExportBlock[] {
  const source = sanitizeMarkdown(markdown ?? "").replace(/\r\n/g, "\n");
  const blocks: ExportBlock[] = [];
  const codeChunks: Array<{ language: string; code: string }> = [];
  let index = 0;

  const withoutCode = source.replace(/```([\w-]*)\s*\n([\s\S]*?)```/g, (_match, language: string, code: string) => {
    codeChunks.push({ language: (language || "text").toLowerCase(), code: code.replace(/\n+$/, "") });
    return `\n${CODE_MARKER}${codeChunks.length - 1}\n`;
  });

  withoutCode.split(/\n{2,}/).forEach((paragraph) => {
    const lines = paragraph.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    const id = `${prefix}-b${index++}`;

    const codeMatch = paragraph.trim().match(CODE_MARKER_PATTERN);
    const codeIndex = codeMatch ? Number(codeMatch[1]) : -1;
    if (codeIndex >= 0 && codeChunks[codeIndex]) {
      const chunk = codeChunks[codeIndex];
      blocks.push({ kind: "code", id, language: chunk.language, code: chunk.code });
      return;
    }

    const heading = paragraph.match(/^(#{1,6})\s+(.*)$/);
    if (heading && lines.length === 1) {
      blocks.push({ kind: "heading", id, level: Math.min(heading[1].length, 3) as 1 | 2 | 3, text: stripInline(heading[2]) });
      return;
    }

    if (lines.length > 1 && isTableDivider(lines[1]) && lines[0].includes("|")) {
      const header = splitTableRow(lines[0]);
      const rows: string[][] = [];
      for (let rowIndex = 2; rowIndex < lines.length; rowIndex += 1) {
        if (!lines[rowIndex].includes("|")) break;
        rows.push(splitTableRow(lines[rowIndex]));
      }
      blocks.push({ kind: "table", id, header, rows });
      return;
    }

    if (lines.every((line) => /^\s*[-*+]\s+/.test(line))) {
      blocks.push({ kind: "list", id, ordered: false, items: lines.map((line) => stripInline(line.replace(/^\s*[-*+]\s+/, ""))) });
      return;
    }

    if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
      blocks.push({ kind: "list", id, ordered: true, items: lines.map((line) => stripInline(line.replace(/^\s*\d+[.)]\s+/, ""))) });
      return;
    }

    if (lines.every((line) => line.startsWith(">"))) {
      blocks.push({ kind: "quote", id, text: stripInline(lines.map((line) => line.replace(/^>\s?/, "")).join(" ")) });
      return;
    }

    blocks.push({ kind: "paragraph", id, text: stripInline(lines.join("\n")) });
  });

  return blocks;
}

function exerciseBlock(section: DocumentSection, id: string): ExportBlock {
  const lines = (section.content ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  const question = stripInline(lines[0] ?? section.title ?? "Exercício").replace(/^\*\*|\*\*$/g, "");
  const guidanceLine = lines.find((line) => /^dica:/i.test(line));
  const answerLine = lines.find((line) => /^resposta:/i.test(line));
  return {
    kind: "exercise",
    id,
    question,
    guidance: guidanceLine ? stripInline(guidanceLine.replace(/^dica:\s*/i, "")) : undefined,
    answer: answerLine ? stripInline(answerLine.replace(/^resposta:\s*/i, "")) : undefined,
  };
}

function sectionBlocks(section: DocumentSection): ExportBlock[] {
  const id = `s-${section.id}`;
  const content = section.content ?? "";
  if (section.type === "exercise") return [exerciseBlock(section, id)];
  if (section.type === "diagram") {
    const match = content.match(/```(\w*)\s*\n([\s\S]*?)```/);
    return [{
      kind: "diagram",
      id,
      language: section.diagram ? "studio" : (match?.[1] || "mermaid").toLowerCase(),
      source: section.diagram ? toMermaidSource(section.diagram) : (match?.[2] ?? content).trim(),
      diagram: section.diagram,
    }];
  }
  if (section.type === "code") {
    const match = content.match(/```(\w*)\s*\n([\s\S]*?)```/);
    return [{ kind: "code", id, language: (match?.[1] || "text").toLowerCase(), code: (match?.[2] ?? content).trim() }];
  }
  if (section.type === "table") {
    const table = parseMarkdownBlocks(content, id).find((block) => block.kind === "table");
    if (table) return [table];
  }
  const parsed = parseMarkdownBlocks(content, id);
  if (section.type === "example") {
    return parsed.map((block) => (block.kind === "paragraph" ? { ...block, kind: "example" as const } : block));
  }
  if (section.type === "summary") {
    return parsed.map((block) => (block.kind === "paragraph" ? { ...block, kind: "summary" as const } : block));
  }
  if (section.type === "blockquote") {
    return parsed.map((block) => (block.kind === "paragraph" ? { ...block, kind: "quote" as const } : block));
  }
  if (section.type === "heading") {
    // O título da seção já é renderizado pelo exportador; os blocos são o corpo.
    return parseMarkdownBlocks(content, id);
  }
  return parsed;
}

/** Constrói o modelo de documento a partir do documento estruturado do Studio. */
export function buildDocumentModel(document: StudioDocument): ExportDocumentModel {
  const structure = document.documentStructure;
  const customization = document.customization;
  const sections: ExportSection[] = (structure?.sections ?? []).map((section) => ({
    id: section.id,
    title: section.title ?? "",
    level: (section.level ?? 2) as 1 | 2 | 3,
    blocks: sectionBlocks(section),
  }));

  return {
    documentId: document.id,
    version: document.version,
    template: document.template,
    title: structure?.title || document.title,
    subtitle: structure?.subtitle,
    description: structure?.description,
    author: customization.coverPage.author || structure?.metadata.author,
    date: customization.coverPage.date,
    subject: structure?.metadata.subject,
    keywords: structure?.metadata.keywords ?? [],
    cover: {
      enabled: customization.coverPage.enabled,
      title: customization.coverPage.title || structure?.title || document.title,
      subtitle: customization.coverPage.subtitle || structure?.subtitle || "",
      author: customization.coverPage.author || "StudyAI Academy",
      date: customization.coverPage.date || "",
    },
    tableOfContents: { ...customization.tableOfContents },
    headerFooter: {
      enabled: customization.headerFooter.enabled,
      headerText: customization.headerFooter.headerText ?? "",
      footerText: customization.headerFooter.footerText ?? "",
      showPageNumbers: customization.headerFooter.showPageNumbers,
    },
    pageNumbering: customization.pageNumbering,
    sections,
  };
}

/** Constrói o modelo de apresentação a partir dos slides do Studio. */
export function buildDeckModel(document: StudioDocument): ExportDeckModel {
  const customization = document.customization;
  return {
    documentId: document.id,
    version: document.version,
    template: document.template,
    title: document.title,
    subtitle: document.documentStructure?.subtitle,
    author: customization.coverPage.author,
    date: customization.coverPage.date,
    slides: (document.slides ?? []).map((slide) => ({
      id: slide.id,
      layout: slide.layout,
      title: slide.title,
      blocks: [
        ...(slide.diagram
          ? [{
              kind: "diagram" as const,
              id: `sl-${slide.id}-diagram`,
              language: "studio",
              source: toMermaidSource(slide.diagram),
              diagram: slide.diagram,
            }]
          : []),
        ...parseMarkdownBlocks(slide.content ?? "", `sl-${slide.id}`),
      ],
      notes: slide.presenterNotes,
      background: slide.background,
      diagram: slide.diagram,
    })),
    headerFooter: {
      enabled: customization.headerFooter.enabled,
      headerText: customization.headerFooter.headerText ?? "",
      footerText: customization.headerFooter.footerText ?? "",
      showPageNumbers: customization.headerFooter.showPageNumbers,
    },
  };
}

/** Serializa o modelo em Markdown para indexação e pré-visualização textual. */
export function modelToMarkdown(model: ExportDocumentModel): string {
  const lines: string[] = [`# ${model.title}`];
  if (model.subtitle) lines.push(`## ${model.subtitle}`);
  if (model.description) lines.push(model.description);
  for (const section of model.sections) {
    if (section.title) lines.push(`## ${section.title}`);
    for (const block of section.blocks) {
      if (block.kind === "heading") lines.push(`### ${block.text}`);
      else if (block.kind === "paragraph") lines.push(block.text);
      else if (block.kind === "example") lines.push(`**Exemplo:** ${block.text}`);
      else if (block.kind === "summary") lines.push(`**Resumo:** ${block.text}`);
      else if (block.kind === "quote") lines.push(`> ${block.text}`);
      else if (block.kind === "list") lines.push(block.items.map((item) => `- ${item}`).join("\n"));
      else if (block.kind === "code") lines.push(`\`\`\`${block.language}\n${block.code}\n\`\`\``);
      else if (block.kind === "diagram") lines.push(`\`\`\`${block.language}\n${block.source}\n\`\`\``);
      else if (block.kind === "table") {
        lines.push(`| ${block.header.join(" | ")} |`);
        lines.push(`| ${block.header.map(() => "---").join(" | ")} |`);
        block.rows.forEach((row) => lines.push(`| ${row.join(" | ")} |`));
      } else if (block.kind === "exercise") {
        lines.push(`**${block.question}**`);
        if (block.guidance) lines.push(`Dica: ${block.guidance}`);
        if (block.answer) lines.push(`Resposta: ${block.answer}`);
      }
    }
  }
  return lines.join("\n\n");
}

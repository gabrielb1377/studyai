/**
 * Exportador PDF do Academy Studio.
 *
 * Consome o `ExportDocumentModel` e o tema resolvido, aplicando tipografia,
 * cores, espaçamentos, margens, capa, sumário, cabeçalho/rodapé e numeração
 * escolhidos no Studio. A paginação evita cortes de texto, títulos órfãos e
 * tabelas quebradas; o documento-fonte nunca é alterado.
 */

import type { ExportBlock, ExportDocumentModel } from "./model";
import { resolveStudioTheme, toRgbComponents } from "./theme";
import type { StudioCustomization } from "../types";

export type StudioPdfOptions = {
  includeAnswers: boolean;
};

export type StudioPdfResult = {
  blob: Blob;
  fileName: string;
  pageCount: number;
};

const SYMBOL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[\u2018\u2019]/g, "'"],
  [/[\u201C\u201D]/g, '"'],
  [/[\u2013\u2014]/g, "-"],
  [/\u2026/g, "..."],
  [/[\u2192\u2190\u2191\u2193]/g, "->"],
  [/\u2264/g, "<="],
  [/\u2265/g, ">="],
  [/\u2260/g, "!="],
  [/\u00d7/g, "x"],
  [/[\u2022\u25cf\u25aa]/g, "-"],
  [/\u00a0/g, " "],
];

/** Normaliza o texto para a codificação WinAnsi das fontes padrão do PDF. */
export function safePdfText(value: string): string {
  let result = value ?? "";
  for (const [pattern, replacement] of SYMBOL_REPLACEMENTS) result = result.replace(pattern, replacement);
  return result.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, "?");
}

type MeasurableFont = { widthOfTextAtSize: (text: string, size: number) => number };

function wrapText(text: string, font: MeasurableFont, size: number, width: number): string[] {
  const normalized = safePdfText(text).replace(/\s+/g, " ").trim();
  if (!normalized) return [""];
  const words = normalized.split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

export function studioFileStem(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "material-studio";
}

export const StudioPdfExporter = {
  async generate(
    model: ExportDocumentModel,
    customization: StudioCustomization,
    options: StudioPdfOptions = { includeAnswers: true },
  ): Promise<StudioPdfResult> {
    const theme = resolveStudioTheme(customization);
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const document = await PDFDocument.create();
    document.setTitle(model.title);
    document.setSubject(model.subtitle ?? model.description ?? "Academy Studio");
    document.setAuthor(model.author ?? "StudyAI Academy");
    document.setCreator("StudyAI Academy Studio");
    document.setProducer("StudyAI");
    document.setCreationDate(new Date());

    const sans = await document.embedFont(StandardFonts.Helvetica);
    const sansBold = await document.embedFont(StandardFonts.HelveticaBold);
    const serif = await document.embedFont(StandardFonts.TimesRoman);
    const serifBold = await document.embedFont(StandardFonts.TimesRomanBold);
    const mono = await document.embedFont(StandardFonts.Courier);

    const regular = theme.font.pdf === "serif" ? serif : theme.font.pdf === "mono" ? mono : sans;
    const bold = theme.font.pdf === "serif" ? serifBold : theme.font.pdf === "mono" ? mono : sansBold;

    const color = (hex: string) => {
      const { r, g, b } = toRgbComponents(hex);
      return rgb(r, g, b);
    };
    const accent = color(theme.colors.accent);
    const accentSoft = color(theme.colors.accentSoft);
    const ink = color(theme.colors.ink);
    const muted = color(theme.colors.muted);
    const border = color(theme.colors.border);
    const onAccent = color(theme.colors.onAccent);
    const surface = color(theme.colors.surface);

    const marginLeft = theme.page.margins.left * 72;
    const marginRight = theme.page.margins.right * 72;
    const marginTop = theme.page.margins.top * 72;
    const marginBottom = theme.page.margins.bottom * 72;
    const contentWidth = theme.page.contentWidth;
    const pageHeight = theme.page.height;
    const pageWidth = theme.page.width;
    const bottomLimit = marginBottom;
    const firstContentIndex = model.cover.enabled ? 1 : 0;

    let page = document.addPage([pageWidth, pageHeight]);
    let y = pageHeight - marginTop;

    const newPage = () => {
      page = document.addPage([pageWidth, pageHeight]);
      y = pageHeight - marginTop;
      return page;
    };
    const ensureSpace = (height: number) => {
      if (y - height < bottomLimit) newPage();
    };

    const measure = (value: string, size: number, font: MeasurableFont, indent = 0) =>
      wrapText(value, font, size, contentWidth - indent).length;

    const drawParagraph = (value: string, size = theme.type.body, font = regular, textColor = ink, indent = 0, gap = theme.type.bodyLeading) => {
      const lines = wrapText(value, font, size, contentWidth - indent);
      ensureSpace(lines.length * gap);
      for (const line of lines) {
        page.drawText(line, { x: marginLeft + indent, y, size, font, color: textColor });
        y -= gap;
      }
      return lines.length;
    };

    const drawHeading = (value: string, level: 1 | 2 | 3) => {
      const size = level === 1 ? theme.type.h1 : level === 2 ? theme.type.h2 : theme.type.h3;
      const spaceBefore = level === 1 ? theme.spacing.section : theme.spacing.section * 0.6;
      if (y - (size + 24) < bottomLimit) newPage();
      y -= spaceBefore;
      drawParagraph(value, size, bold, level === 1 ? accent : ink, 0, size + 5);
      if (level === 1) {
        page.drawLine({
          start: { x: marginLeft, y: y + 5 },
          end: { x: pageWidth - marginRight, y: y + 5 },
          thickness: 0.8,
          color: border,
        });
        y -= 8;
      }
    };

    const drawList = (items: string[], ordered: boolean) => {
      items.forEach((item, index) => {
        const marker = ordered ? `${index + 1}.` : "-";
        const lines = wrapText(item, regular, theme.type.body, contentWidth - 18);
        const height = lines.length * theme.type.bodyLeading;
        ensureSpace(height + 2);
        page.drawText(marker, { x: marginLeft + 8, y, size: theme.type.body, font: bold, color: accent });
        lines.forEach((line, lineIndex) => {
          page.drawText(line, { x: marginLeft + 18, y: y - lineIndex * theme.type.bodyLeading, size: theme.type.body, font: regular, color: ink });
        });
        y -= height + 2;
      });
      y -= theme.spacing.paragraph * 0.5;
    };

    const drawCode = (code: string, label: string) => {
      const lines = safePdfText(code).split("\n");
      const lineHeight = theme.type.code + 4;
      const labelHeight = theme.type.caption + 8;
      if (label) {
        ensureSpace(labelHeight + lineHeight);
        page.drawText(safePdfText(label), { x: marginLeft, y, size: theme.type.caption, font: bold, color: accent });
        y -= labelHeight;
      }
      for (const raw of lines) {
        for (const line of wrapText(raw || " ", mono, theme.type.code, contentWidth - 20)) {
          if (y - lineHeight < bottomLimit) newPage();
          page.drawRectangle({ x: marginLeft, y: y - lineHeight + 4, width: contentWidth, height: lineHeight, color: accentSoft });
          page.drawText(line, { x: marginLeft + 8, y, size: theme.type.code, font: mono, color: ink });
          y -= lineHeight;
        }
      }
      y -= theme.spacing.paragraph;
    };

    const drawTable = (header: string[], rows: string[][]) => {
      const columns = Math.max(header.length, ...rows.map((row) => row.length), 1);
      const columnWidth = contentWidth / columns;
      const cellPadding = 5;
      const lineHeight = theme.type.caption + 5;

      const renderRow = (cells: string[], isHeader: boolean) => {
        const font = isHeader ? bold : regular;
        const wrapped = cells.map((cell) => wrapText(cell, font, theme.type.caption + 1, columnWidth - cellPadding * 2));
        const height = Math.max(1, ...wrapped.map((cell) => cell.length)) * lineHeight + cellPadding * 2;
        if (y - height < bottomLimit) newPage();
        page.drawRectangle({
          x: marginLeft,
          y: y - height + 6,
          width: contentWidth,
          height,
          color: isHeader ? accentSoft : surface,
          borderColor: border,
          borderWidth: 0.5,
        });
        wrapped.forEach((cellLines, columnIndex) => {
          cellLines.forEach((line, lineIndex) => {
            page.drawText(line, {
              x: marginLeft + columnIndex * columnWidth + cellPadding,
              y: y - lineIndex * lineHeight,
              size: theme.type.caption + 1,
              font,
              color: isHeader ? accent : ink,
            });
          });
        });
        y -= height;
      };

      renderRow(Array.from({ length: columns }, (_, index) => header[index] ?? ""), true);
      rows.forEach((row) => renderRow(Array.from({ length: columns }, (_, column) => row[column] ?? ""), false));
      y -= theme.spacing.paragraph;
    };

    const drawExercise = (block: Extract<ExportBlock, { kind: "exercise" }>) => {
      ensureSpace(theme.type.h3 + 12);
      drawParagraph(block.question, theme.type.h3, bold, accent, 0, theme.type.h3 + 4);
      if (block.guidance) drawParagraph(`Dica: ${block.guidance}`, theme.type.body - 0.5, regular, muted, 10, theme.type.bodyLeading);
      if (options.includeAnswers && block.answer) {
        drawParagraph(`Resposta: ${block.answer}`, theme.type.body, regular, ink, 10, theme.type.bodyLeading);
      }
      y -= theme.spacing.paragraph;
    };

    const drawCallout = (text: string, textColor: typeof ink, background?: typeof accentSoft) => {
      const lines = measure(text, theme.type.body, regular, 10);
      const height = lines * theme.type.bodyLeading + 8;
      ensureSpace(height);
      if (background) {
        page.drawRectangle({ x: marginLeft, y: y - height + 6, width: contentWidth, height, color: background });
      } else {
        page.drawRectangle({ x: marginLeft, y: y - 2, width: 2.5, height: height - 2, color: accent });
      }
      drawParagraph(text, theme.type.body, regular, textColor, 10, theme.type.bodyLeading);
      y -= theme.spacing.paragraph * 0.6;
    };

    const drawBlock = (block: ExportBlock) => {
      if (block.kind === "heading") drawHeading(block.text, block.level);
      else if (block.kind === "paragraph") { drawParagraph(block.text); y -= theme.spacing.paragraph; }
      else if (block.kind === "list") drawList(block.items, block.ordered);
      else if (block.kind === "code") drawCode(block.code, block.language === "mermaid" ? "Diagrama Mermaid - fonte editável" : `Código${block.language && block.language !== "text" ? ` (${block.language})` : ""}`);
      else if (block.kind === "diagram") drawCode(block.source, `Diagrama ${block.language} - fonte editável`);
      else if (block.kind === "table") drawTable(block.header, block.rows);
      else if (block.kind === "example") drawCallout(block.text, ink);
      else if (block.kind === "summary") drawCallout(block.text, ink, accentSoft);
      else if (block.kind === "quote") drawCallout(block.text, muted);
      else if (block.kind === "exercise") drawExercise(block);
    };

    // ------------------------------------------------------------------ Capa
    if (model.cover.enabled) {
      page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: accent });
      page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: 8, color: onAccent });
      const coverTitleSize = theme.type.h1 + 8;
      let coverY = pageHeight - marginTop - coverTitleSize;
      for (const line of wrapText(model.cover.title, bold, coverTitleSize, contentWidth)) {
        page.drawText(line, { x: marginLeft, y: coverY, size: coverTitleSize, font: bold, color: onAccent });
        coverY -= coverTitleSize + 8;
      }
      if (model.cover.subtitle) {
        for (const line of wrapText(model.cover.subtitle, regular, theme.type.h2, contentWidth)) {
          page.drawText(line, { x: marginLeft, y: coverY, size: theme.type.h2, font: regular, color: onAccent });
          coverY -= theme.type.h2 + 5;
        }
      }
      page.drawText(safePdfText("STUDYAI ACADEMY"), { x: marginLeft, y: pageHeight - marginTop + 18, size: theme.type.caption + 2, font: bold, color: onAccent });
      if (model.cover.author) {
        page.drawText(safePdfText(model.cover.author), { x: marginLeft, y: marginBottom + 42, size: theme.type.body, font: regular, color: onAccent });
      }
      if (model.cover.date) {
        page.drawText(safePdfText(model.cover.date), { x: marginLeft, y: marginBottom + 24, size: theme.type.caption + 1, font: regular, color: onAccent });
      }
      newPage();
    }

    // ---------------------------------------------------------------- Sumário
    const tocEntries = model.tableOfContents.enabled
      ? model.sections.filter((section) => section.level <= model.tableOfContents.depth)
      : [];
    let tocPage: typeof page | null = null;
    let tocStartY = 0;
    if (tocEntries.length) {
      tocPage = newPage();
      tocStartY = y;
      if (tocEntries.length * (theme.type.body + 8) > theme.page.contentHeight) {
        tocPage = newPage();
        tocStartY = y;
      }
    }

    // --------------------------------------------------------------- Conteúdo
    const sectionPages: Array<{ title: string; page: number }> = [];
    model.sections.forEach((section) => {
      if (section.level <= 1) newPage();
      sectionPages.push({ title: section.title, page: document.getPageCount() - firstContentIndex });
      if (section.title) drawHeading(section.title, section.level <= 1 ? 1 : 2);
      section.blocks.forEach(drawBlock);
    });

    // ---------------------------------------------------------- Sumário final
    if (tocPage) {
      let tocY = tocStartY;
      tocEntries.forEach((entry, index) => {
        const found = sectionPages[index];
        const indent = Math.max(0, (entry.level - 1) * 12);
        const size = theme.type.body - (entry.level > 1 ? 1 : 0);
        const label = safePdfText(entry.title || "Seção");
        const pageLabel = found ? String(found.page) : "-";
        const pageLabelWidth = bold.widthOfTextAtSize(pageLabel, size);
        const maxCharacters = Math.max(8, Math.floor((contentWidth - indent - pageLabelWidth - 12) / (size * 0.52)));
        tocPage!.drawText(label.length > maxCharacters ? `${label.slice(0, maxCharacters - 3)}...` : label, {
          x: marginLeft + indent,
          y: tocY,
          size,
          font: entry.level === 1 ? bold : regular,
          color: entry.level === 1 ? accent : ink,
        });
        tocPage!.drawText(pageLabel, { x: pageWidth - marginRight - pageLabelWidth, y: tocY, size, font: bold, color: accent });
        tocY -= size + 8;
      });
    }

    // ------------------------------------------------- Cabeçalho e rodapé
    document.getPages().forEach((current, index) => {
      if (index < firstContentIndex) return;
      const contentIndex = index - firstContentIndex;
      if (model.headerFooter.enabled) {
        const headerText = safePdfText(model.headerFooter.headerText || model.title);
        current.drawText(headerText.slice(0, 80), { x: marginLeft, y: pageHeight - marginTop + 14, size: theme.type.caption, font: regular, color: muted });
      }
      current.drawLine({
        start: { x: marginLeft, y: marginBottom - 12 },
        end: { x: pageWidth - marginRight, y: marginBottom - 12 },
        thickness: 0.5,
        color: border,
      });
      if (model.headerFooter.enabled) {
        const footerText = safePdfText(model.headerFooter.footerText);
        if (footerText) current.drawText(footerText.slice(0, 80), { x: marginLeft, y: marginBottom - 26, size: theme.type.caption, font: regular, color: muted });
      }
      if (model.headerFooter.showPageNumbers && model.pageNumbering !== "none") {
        const label = String(contentIndex + 1);
        const width = bold.widthOfTextAtSize(label, theme.type.caption);
        const x = model.pageNumbering === "bottom-right" || model.pageNumbering === "top-right"
          ? pageWidth - marginRight - width
          : pageWidth / 2 - width / 2;
        const yPosition = model.pageNumbering === "top-right" ? pageHeight - marginTop + 14 : marginBottom - 26;
        current.drawText(label, { x, y: yPosition, size: theme.type.caption, font: bold, color: muted });
      }
    });

    const bytes = await document.save();
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    return {
      blob,
      fileName: `${studioFileStem(model.title)}-studio.pdf`,
      pageCount: document.getPageCount(),
    };
  },
};

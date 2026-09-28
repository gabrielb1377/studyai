import type { AcademyGeneratedContent, AcademyStudy } from "../types";
import { academyContentFileStem } from "./AcademyContentFormatter";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function safeText(value: string) {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[→↓]/g, "->")
    .replace(/[•●]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function plainMarkdown(value: string) {
  return safeText(value)
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_~`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wrap(text: string, font: { widthOfTextAtSize: (text: string, size: number) => number }, size: number, width: number) {
  const words = safeText(text).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function markdownTables(value: string) {
  const lines = value.split("\n");
  const tables: string[][][] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].includes("|") || !/^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) continue;
    const rows: string[][] = [lines[index].split("|").map(plainMarkdown).filter(Boolean)];
    index += 2;
    while (index < lines.length && lines[index].includes("|")) {
      rows.push(lines[index].split("|").map(plainMarkdown).filter(Boolean));
      index += 1;
    }
    tables.push(rows.filter((row) => row.length));
  }
  return tables.filter((table) => table.length > 1);
}

function codeBlocks(value: string) {
  return [...value.matchAll(/```([\w-]*)\s*\n([\s\S]*?)```/g)].map((match) => ({ language: match[1].toLowerCase(), code: safeText(match[2].trim()) }));
}

export const PdfContentGenerator = {
  async generate(study: AcademyStudy, content: AcademyGeneratedContent, options: { workbook?: boolean } = {}) {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const document = await PDFDocument.create();
    document.setTitle(content.title);
    document.setSubject(`${study.subject} - ${study.topic}`);
    document.setAuthor("StudyAI");
    document.setCreator("StudyAI Academy");
    document.setProducer("StudyAI");
    document.setCreationDate(new Date());
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const mono = await document.embedFont(StandardFonts.Courier);
    const navy = rgb(0.08, 0.16, 0.29);
    const blue = rgb(0.18, 0.36, 0.69);
    const muted = rgb(0.36, 0.41, 0.49);
    const pale = rgb(0.95, 0.97, 1);
    let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    const newPage = () => {
      page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      return page;
    };
    const ensure = (height: number) => { if (y - height < MARGIN) newPage(); };
    const line = (value: string, size = 11, font = regular, color = navy, indent = 0, gap = 4) => {
      const lines = wrap(plainMarkdown(value), font, size, CONTENT_WIDTH - indent);
      const height = lines.length * (size + gap);
      ensure(height + 4);
      for (const text of lines) {
        page.drawText(text, { x: MARGIN + indent, y, size, font, color });
        y -= size + gap;
      }
      y -= 3;
    };
    const heading = (value: string, level: 1 | 2 = 1) => {
      const size = level === 1 ? 22 : 15;
      ensure(size + 28);
      y -= level === 1 ? 8 : 2;
      line(value, size, bold, level === 1 ? navy : blue, 0, 6);
      if (level === 1) {
        page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 2 }, thickness: 1, color: rgb(0.84, 0.88, 0.94) });
        y -= 10;
      }
    };
    const bullets = (values: readonly string[]) => values.forEach((value) => line(`- ${value}`, 10.5, regular, navy, 10));
    const code = (value: string, label: string) => {
      const lines = safeText(value).split("\n");
      ensure(Math.min(lines.length, 18) * 13 + 38);
      line(label, 9, bold, blue);
      for (const rawLine of lines) {
        const wrapped = wrap(rawLine || " ", mono, 8.5, CONTENT_WIDTH - 24);
        for (const codeLine of wrapped) {
          ensure(15);
          page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_WIDTH, height: 15, color: pale });
          page.drawText(codeLine, { x: MARGIN + 10, y, size: 8.5, font: mono, color: navy });
          y -= 15;
        }
      }
      y -= 9;
    };
    const table = (rows: string[][]) => {
      const columns = Math.max(...rows.map((row) => row.length));
      if (!columns) return;
      const columnWidth = CONTENT_WIDTH / columns;
      rows.forEach((row, rowIndex) => {
        const cells = Array.from({ length: columns }, (_, index) => row[index] ?? "");
        const wrapped = cells.map((cell) => wrap(cell, rowIndex === 0 ? bold : regular, 8.5, columnWidth - 12));
        const rowHeight = Math.max(24, Math.max(...wrapped.map((cell) => cell.length)) * 11 + 8);
        ensure(rowHeight + 2);
        page.drawRectangle({ x: MARGIN, y: y - rowHeight + 10, width: CONTENT_WIDTH, height: rowHeight, color: rowIndex === 0 ? rgb(0.9, 0.93, 0.98) : rgb(0.985, 0.99, 1), borderColor: rgb(0.8, 0.84, 0.9), borderWidth: 0.5 });
        wrapped.forEach((cellLines, columnIndex) => cellLines.forEach((cellLine, lineIndex) => page.drawText(cellLine, { x: MARGIN + columnIndex * columnWidth + 6, y: y - lineIndex * 11, size: 8.5, font: rowIndex === 0 ? bold : regular, color: navy })));
        y -= rowHeight;
      });
      y -= 10;
    };
    const markdown = (value: string) => {
      const blocks = codeBlocks(value);
      const withoutCode = value.replace(/```[\w-]*\s*\n[\s\S]*?```/g, "\n");
      const tables = markdownTables(withoutCode);
      const withoutTables = withoutCode.split("\n").filter((entry) => !entry.includes("|") && !/^\s*:?-{3,}/.test(entry)).join("\n");
      withoutTables.split(/\n{2,}/).map(plainMarkdown).filter(Boolean).forEach((paragraph) => line(paragraph));
      tables.forEach(table);
      blocks.forEach((block) => code(block.code, block.language === "mermaid" ? "Diagrama Mermaid - fonte editável" : `Código${block.language ? ` (${block.language})` : ""}`));
    };

    page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: navy });
    page.drawText(options.workbook ? "APOSTILA ACADEMY" : "STUDYAI ACADEMY", { x: MARGIN, y: PAGE_HEIGHT - 90, size: 11, font: bold, color: rgb(0.55, 0.72, 1) });
    const coverLines = wrap(content.title, bold, 30, CONTENT_WIDTH);
    coverLines.forEach((coverLine, index) => page.drawText(coverLine, { x: MARGIN, y: PAGE_HEIGHT - 190 - index * 38, size: 30, font: bold, color: rgb(1, 1, 1) }));
    page.drawText(safeText(study.subject), { x: MARGIN, y: 155, size: 16, font: regular, color: rgb(0.8, 0.86, 0.95) });
    page.drawText(safeText(study.topic), { x: MARGIN, y: 125, size: 11, font: regular, color: rgb(0.63, 0.7, 0.8) });

    const contentsPage = newPage();
    heading("Sumário");
    const tocStartY = y;
    const chapterPages: Array<{ title: string; page: number }> = [];
    newPage();
    heading("Introdução");
    line(content.objective, 12);
    heading("Objetivos", 2);
    bullets(content.modules.map((module) => module.objective || module.title));
    if (content.prerequisites.length) { heading("Pré-requisitos", 2); bullets(content.prerequisites); }

    content.chapters.forEach((chapter, index) => {
      newPage();
      chapterPages.push({ title: chapter.title, page: document.getPageCount() });
      heading(`${index + 1}. ${chapter.title}`);
      if (chapter.objective) line(`Objetivo: ${chapter.objective}`, 11, bold, blue);
      markdown(chapter.content);
      if (chapter.concepts.length) { heading("Conceitos principais", 2); bullets(chapter.concepts); }
      if (chapter.examples.length) { heading("Exemplos", 2); chapter.examples.forEach((example) => line(example)); }
    });

    newPage(); heading("Resumo"); markdown(content.summary);
    if (content.review.length) { heading("Revisão", 2); bullets(content.review); }
    if (content.exercises.length) {
      newPage(); heading("Exercícios");
      content.exercises.forEach((exercise, index) => { heading(`${index + 1}. ${exercise.question}`, 2); if (exercise.guidance) line(exercise.guidance, 10, regular, muted); });
      newPage(); heading("Gabarito");
      content.exercises.forEach((exercise, index) => { heading(`${index + 1}. ${exercise.question}`, 2); line(exercise.answer); });
    }
    newPage(); heading("Referências internas");
    chapterPages.forEach((chapter, index) => line(`${index + 1}. ${chapter.title} - página ${chapter.page}`, 10));
    line("Os conteúdos, exemplos e exercícios deste documento foram gerados dentro do StudyAI Academy e permanecem vinculados ao estudo de origem.", 9, regular, muted);

    let tocY = tocStartY;
    chapterPages.forEach((chapter, index) => {
      const title = `${index + 1}. ${plainMarkdown(chapter.title)}`;
      contentsPage.drawText(title.slice(0, 66), { x: MARGIN, y: tocY, size: 11, font: regular, color: navy });
      contentsPage.drawText(String(chapter.page), { x: PAGE_WIDTH - MARGIN - 18, y: tocY, size: 11, font: bold, color: blue });
      tocY -= 24;
    });

    const pages = document.getPages();
    pages.slice(1).forEach((current, index) => {
      current.drawLine({ start: { x: MARGIN, y: 37 }, end: { x: PAGE_WIDTH - MARGIN, y: 37 }, thickness: 0.5, color: rgb(0.82, 0.85, 0.9) });
      current.drawText(safeText(content.title).slice(0, 60), { x: MARGIN, y: 22, size: 7.5, font: regular, color: muted });
      current.drawText(String(index + 2), { x: PAGE_WIDTH - MARGIN - 10, y: 22, size: 8, font: bold, color: muted });
    });

    const bytes = await document.save();
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    const suffix = options.workbook ? "apostila" : "material";
    return { blob, fileName: `${academyContentFileStem(content.title)}-${suffix}.pdf`, pageCount: document.getPageCount() };
  },
};

import type { ExtractedTable } from "../extraction/ExtractionTypes";
import { OCR_LIMITS } from "./limits";

type TableCandidate = {
  rows: string[][];
  header: boolean;
  source: "text" | "ocr";
  startLine: number;
  endLine: number;
  warnings: string[];
};

function cleanCell(value: string) {
  return value.replace(/\\\|/g, "|").replace(/\s+/g, " ").trim().slice(0, OCR_LIMITS.maxTableCellChars);
}

function splitPipeRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;
  const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cleanCell);
  return cells.length >= 2 ? cells : null;
}

function isSeparatorRow(cells: readonly string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s+/g, "")));
}

function splitAlignedRow(line: string) {
  const normalized = line.replace(/\t/g, "  ").trimEnd();
  if (normalized.trim().length < 8) return null;
  const cells = normalized.split(/\s{2,}/).map(cleanCell).filter((cell, index, values) => (
    cell.length > 0 || (index > 0 && index < values.length - 1)
  ));
  if (cells.length < 2 || cells.length > OCR_LIMITS.maxTableColumns) return null;
  if (cells.some((cell) => cell.split(/\s+/).length > 10)) return null;
  return cells;
}

function isProseLikeRow(cells: readonly string[]) {
  const prose = cells.filter((cell) => /[.!?]$/.test(cell) && cell.split(/\s+/).length > 6).length;
  return prose >= Math.max(1, Math.ceil(cells.length / 2));
}

function detectPipeTables(lines: readonly string[]) {
  const candidates: TableCandidate[] = [];
  let index = 0;

  while (index < lines.length) {
    const first = splitPipeRow(lines[index]);
    if (!first || isSeparatorRow(first)) {
      index += 1;
      continue;
    }
    const rows: string[][] = [first];
    const startLine = index;
    let header = false;
    let cursor = index + 1;
    if (cursor < lines.length) {
      const separator = splitPipeRow(lines[cursor]);
      if (separator && isSeparatorRow(separator)) {
        header = true;
        cursor += 1;
      }
    }
    while (cursor < lines.length) {
      const row = splitPipeRow(lines[cursor]);
      if (!row || isSeparatorRow(row)) break;
      rows.push(row);
      cursor += 1;
    }
    if (rows.length >= 2 && cursor - startLine >= 2) {
      candidates.push({ rows, header, source: "text", startLine, endLine: cursor - 1, warnings: [] });
    }
    index = Math.max(cursor, index + 1);
  }

  return candidates;
}

function detectAlignedTables(lines: readonly string[]) {
  const candidates: TableCandidate[] = [];
  let index = 0;

  while (index < lines.length) {
    const first = splitAlignedRow(lines[index]);
    if (!first) {
      index += 1;
      continue;
    }
    const rows: string[][] = [first];
    const startLine = index;
    let cursor = index + 1;
    while (cursor < lines.length) {
      const row = splitAlignedRow(lines[cursor]);
      if (!row) break;
      rows.push(row);
      cursor += 1;
    }

    const validBlock = rows.length >= 3 && rows.length <= OCR_LIMITS.maxTableRows &&
      !rows.every(isProseLikeRow) &&
      !rows.some((row) => row.length > OCR_LIMITS.maxTableColumns);
    if (validBlock) {
      const counts = new Map<number, number>();
      for (const row of rows) counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
      const [dominant, frequency] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0] ?? [0, 0];
      if (dominant >= 2 && frequency / rows.length >= 0.6) {
        const warnings = rows.some((row) => row.length !== dominant)
          ? ["Algumas linhas têm quantidade de colunas diferente; confira a tabela."]
          : [];
        candidates.push({ rows, header: false, source: "text", startLine, endLine: cursor - 1, warnings });
      }
    }

    index = Math.max(cursor, index + 1);
  }

  return candidates;
}

export function detectTableCandidates(text: string): TableCandidate[] {
  const lines = text.split("\n");
  const candidates = [...detectPipeTables(lines), ...detectAlignedTables(lines)]
    .sort((left, right) => left.startLine - right.startLine);

  const accepted: TableCandidate[] = [];
  let consumedUntil = -1;
  for (const candidate of candidates) {
    if (candidate.startLine <= consumedUntil) continue;
    accepted.push(candidate);
    consumedUntil = candidate.endLine;
    if (accepted.length >= OCR_LIMITS.maxTablesPerPage) break;
  }
  return accepted;
}

export function tableToMarkdown(rows: readonly (readonly string[])[]) {
  if (rows.length === 0) return "";
  const columns = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array<string>(Math.max(0, columns - row.length)).fill("")]);
  const lines = [
    `| ${normalized[0].join(" | ")} |`,
    `| ${Array<string>(columns).fill("---").join(" | ")} |`,
    ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ];
  return lines.join("\n");
}

export function markdownRows(markdown: string) {
  const rows = markdown.split("\n")
    .map(splitPipeRow)
    .filter((row): row is string[] => Boolean(row))
    .filter((row) => !isSeparatorRow(row));
  return rows;
}

export function parseMarkdownTable(text: string) {
  const rows = markdownRows(text);
  if (rows.length < 2) return null;
  const columns = Math.max(...rows.map((row) => row.length));
  return {
    rows,
    columns,
    header: true,
    complete: rows.every((row) => row.length === columns),
  };
}

export type StructuredPage = {
  text: string;
  tables: ExtractedTable[];
};

export function structureTables(text: string, page: number): StructuredPage {
  const candidates = detectTableCandidates(text);
  if (candidates.length === 0) return { text, tables: [] };
  const lines = text.split("\n");
  const tables: ExtractedTable[] = [];
  const output: string[] = [];
  let cursor = 0;

  for (const [index, candidate] of candidates.entries()) {
    for (; cursor < candidate.startLine; cursor += 1) output.push(lines[cursor]);
    const columns = Math.max(...candidate.rows.map((row) => row.length));
    const complete = candidate.rows.every((row) => row.length === columns);
    const warnings = [...candidate.warnings];
    if (!complete) warnings.push("A tabela tem células ausentes; o conteúdo não foi preenchido automaticamente.");
    const markdown = tableToMarkdown(candidate.rows);
    output.push(markdown);
    tables.push({
      id: `table-p${page}-${index + 1}`,
      page,
      markdown,
      header: candidate.header,
      complete,
      source: candidate.source,
      warnings,
      rows: candidate.rows,
      columns,
    });
    cursor = candidate.endLine + 1;
  }
  for (; cursor < lines.length; cursor += 1) output.push(lines[cursor]);

  return { text: output.join("\n"), tables };
}

export function updateTableCell(table: ExtractedTable, row: number, column: number, value: string): ExtractedTable {
  const rows = table.rows.map((current, rowIndex) => {
    if (rowIndex !== row) return [...current];
    const next = [...current];
    while (next.length <= column) next.push("");
    next[column] = cleanCell(value);
    return next;
  });
  const columns = Math.max(table.columns, ...rows.map((current) => current.length));
  const complete = rows.every((current) => current.length === columns);
  return {
    ...table,
    rows,
    columns,
    complete,
    markdown: tableToMarkdown(rows),
    warnings: table.warnings.filter((warning) => !warning.startsWith("A tabela tem células ausentes")),
  };
}

export function replaceTableInText(text: string, previousMarkdown: string, nextMarkdown: string) {
  if (!previousMarkdown) return text;
  const index = text.indexOf(previousMarkdown);
  if (index < 0) return text;
  return `${text.slice(0, index)}${nextMarkdown}${text.slice(index + previousMarkdown.length)}`;
}

export function tablesToPlainText(tables: readonly ExtractedTable[]) {
  return tables.map((table) => table.markdown).join("\n\n");
}

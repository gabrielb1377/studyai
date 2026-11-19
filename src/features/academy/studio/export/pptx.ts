/**
 * Exportador PPTX do Academy Studio.
 *
 * Produz um pacote Open XML real com caixas de texto editáveis, tabelas
 * editáveis, formas nativas e notas do apresentador. Slides nunca são
 * exportados como imagens: cada elemento continua editável no PowerPoint.
 */

import JSZip from "jszip";
import type { ExportBlock, ExportDeckModel } from "./model";
import { resolveStudioTheme, toHexRgb, type StudioTheme } from "./theme";
import { studioFileStem } from "./pdf";
import type { StudioCustomization } from "../types";
import { edgeLabelPoint, layoutDiagram } from "@/features/diagrams/layout";
import type { DiagramDocument } from "@/features/diagrams/types";

export type StudioPptxResult = {
  blob: Blob;
  fileName: string;
  slideCount: number;
};

const EMU = 914_400;
const SLIDE_16_9 = { width: 12_192_000, height: 6_858_000 };
const SLIDE_4_3 = { width: 9_144_000, height: 6_858_000 };

type PptxText = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  color?: string;
  bold?: boolean;
  font?: string;
  bullets?: boolean;
  align?: "l" | "ctr" | "r";
  fill?: string;
  spacing?: number;
};

type PptxShape = {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  line?: string;
  lineWidth?: number;
  radius?: boolean;
  geometry?: "rect" | "roundRect" | "ellipse" | "diamond";
  text?: string;
  textSize?: number;
  textColor?: string;
  font?: string;
  bold?: boolean;
};

type PptxConnector = {
  x: number;
  y: number;
  w: number;
  h: number;
  flipH: boolean;
  flipV: boolean;
  line: string;
  width: number;
  dashed?: boolean;
  arrow?: boolean;
};

type PptxTable = {
  x: number;
  y: number;
  w: number;
  h: number;
  header: string[];
  rows: string[][];
  headerFill: string;
  bodyFill: string;
  line: string;
  color: string;
  headerColor: string;
  font: string;
};

type SlideFrame = {
  background: string;
  texts: PptxText[];
  shapes: PptxShape[];
  tables: PptxTable[];
  connectors: PptxConnector[];
  notes?: string;
};

function xml(value: string): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function plain(value: string): string {
  return (value ?? "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_~`>#]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

function toEmu(inches: number): number {
  return Math.round(inches * EMU);
}

function paragraphs(item: PptxText): string {
  const lines = item.text.split("\n");
  const bullet = item.bullets ? '<a:pPr marL="228600" indent="-228600"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>' : "";
  const align = item.align && item.align !== "l" ? ` algn="${item.align}"` : "";
  const spacing = item.spacing ? `<a:lnSpc><a:spcPct val="${Math.round(item.spacing * 1000)}"/></a:lnSpc>` : "";
  return lines
    .map((line) => {
      const text = line.length ? line : " ";
      const run = `<a:r><a:rPr lang="pt-BR" sz="${Math.round(item.size * 100)}"${item.bold ? ' b="1"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${item.color ?? "1F2937"}"/></a:solidFill><a:latin typeface="${xml(item.font ?? "Aptos")}"/><a:cs typeface="${xml(item.font ?? "Aptos")}"/></a:rPr><a:t>${xml(text)}</a:t></a:r>`;
      return `<a:p><a:pPr${align}>${spacing}${bullet}</a:pPr>${run}<a:endParaRPr lang="pt-BR" sz="${Math.round(item.size * 100)}"/></a:p>`;
    })
    .join("");
}

function textBox(item: PptxText, id: number): string {
  const fill = item.fill ? `<a:solidFill><a:srgbClr val="${item.fill}"/></a:solidFill>` : "<a:noFill/>";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Texto ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${toEmu(item.x)}" y="${toEmu(item.y)}"/><a:ext cx="${toEmu(item.w)}" cy="${toEmu(item.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="91440" rIns="91440" tIns="45720" bIns="45720" anchor="t"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs(item)}</p:txBody></p:sp>`;
}

function shape(item: PptxShape, id: number): string {
  const fill = item.fill ? `<a:solidFill><a:srgbClr val="${item.fill}"/></a:solidFill>` : "<a:noFill/>";
  const line = item.line
    ? `<a:ln w="${Math.round((item.lineWidth ?? 1) * 12700)}"><a:solidFill><a:srgbClr val="${item.line}"/></a:solidFill></a:ln>`
    : "<a:ln><a:noFill/></a:ln>";
  const geometry = item.geometry ?? (item.radius ? "roundRect" : "rect");
  const body = item.text
    ? item.text
        .split("\n")
        .map(
          (lineText) =>
            `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="pt-BR" sz="${Math.round((item.textSize ?? 11) * 100)}"${item.bold ? ' b="1"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${item.textColor ?? "1F2937"}"/></a:solidFill><a:latin typeface="${xml(item.font ?? "Aptos")}"/><a:cs typeface="${xml(item.font ?? "Aptos")}"/></a:rPr><a:t>${xml(lineText || " ")}</a:t></a:r><a:endParaRPr lang="pt-BR" sz="${Math.round((item.textSize ?? 11) * 100)}"/></a:p>`,
        )
        .join("")
    : '<a:p><a:endParaRPr lang="pt-BR"/></a:p>';
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Forma ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${toEmu(item.x)}" y="${toEmu(item.y)}"/><a:ext cx="${toEmu(item.w)}" cy="${toEmu(item.h)}"/></a:xfrm><a:prstGeom prst="${geometry}"><a:avLst/></a:prstGeom>${fill}${line}</p:spPr><p:txBody><a:bodyPr wrap="square" lIns="27432" rIns="27432" tIns="18288" bIns="18288" anchor="ctr"><a:normAutofit/></a:bodyPr><a:lstStyle/>${body}</p:txBody></p:sp>`;
}

function connector(item: PptxConnector, id: number): string {
  const flip = `${item.flipH ? ' flipH="1"' : ""}${item.flipV ? ' flipV="1"' : ""}`;
  const dash = item.dashed ? '<a:prstDash val="dash"/>' : "";
  const arrow = item.arrow ? '<a:tailEnd type="triangle" w="med" len="med"/>' : "";
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="Conector ${id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm${flip}><a:off x="${toEmu(item.x)}" y="${toEmu(item.y)}"/><a:ext cx="${toEmu(item.w)}" cy="${toEmu(item.h)}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${Math.round(item.width * 12700)}"><a:solidFill><a:srgbClr val="${item.line}"/></a:solidFill>${dash}${arrow}</a:ln></p:spPr></p:cxnSp>`;
}

function tableCell(text: string, width: number, fill: string, color: string, bold: boolean, font: string, size: number): string {
  return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="pt-BR" sz="${Math.round(size * 100)}"${bold ? ' b="1"' : ""}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${xml(font)}"/></a:rPr><a:t>${xml(text || " ")}</a:t></a:r></a:p></a:txBody><a:tcPr marL="72000" marR="72000" marT="36000" marB="36000" anchor="ctr"><a:lnL w="6350"><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></a:lnL><a:lnR w="6350"><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></a:lnR><a:lnT w="6350"><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></a:lnT><a:lnB w="6350"><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></a:lnB><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></a:tcPr></a:tc>`;
}

function tableFrame(item: PptxTable, id: number): string {
  const columns = Math.max(item.header.length, ...item.rows.map((row) => row.length), 1);
  const columnWidth = Math.floor(item.w / columns);
  const rowHeight = Math.max(0.3, Math.min(0.7, item.h / Math.max(item.rows.length + 1, 1)));
  const grid = Array.from({ length: columns }, () => `<a:gridCol w="${toEmu(columnWidth)}"/>`).join("");
  const headerCells = Array.from({ length: columns }, (_, index) => tableCell(item.header[index] ?? "", columnWidth, item.headerFill, item.headerColor, true, item.font, 12)).join("");
  const bodyRows = item.rows
    .map((row) => `<a:tr h="${toEmu(rowHeight)}">${Array.from({ length: columns }, (_, index) => tableCell(row[index] ?? "", columnWidth, item.bodyFill, item.color, false, item.font, 12)).join("")}</a:tr>`)
    .join("");
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Tabela ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${toEmu(item.x)}" y="${toEmu(item.y)}"/><a:ext cx="${toEmu(item.w)}" cy="${toEmu(rowHeight * (item.rows.length + 1))}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${grid}</a:tblGrid><a:tr h="${toEmu(rowHeight)}">${headerCells}</a:tr>${bodyRows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

function slideXml(frame: SlideFrame): string {
  let id = 2;
  const shapes = frame.shapes.map((item) => shape(item, id++)).join("");
  const connectors = frame.connectors.map((item) => connector(item, id++)).join("");
  const texts = frame.texts.map((item) => textBox(item, id++)).join("");
  const tables = frame.tables.map((item) => tableFrame(item, id++)).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${frame.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${connectors}${shapes}${texts}${tables}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function notesXml(notes: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Espaco de Notas 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="pt-BR" dirty="0"/><a:t>${xml(notes)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

function contentTypes(slideCount: number): string {
  const slides = Array.from({ length: slideCount }, (_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  const notes = Array.from({ length: slideCount }, (_, index) => `<Override PartName="/ppt/notesSlides/notesSlide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${slides}${notes}</Types>`;
}

function presentationXml(slideCount: number, size: { width: number; height: number }): string {
  const ids = Array.from({ length: slideCount }, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId${slideCount + 2}"/></p:notesMasterIdLst><p:sldIdLst>${ids}</p:sldIdLst><p:sldSz cx="${size.width}" cy="${size.height}" type="${size.width === SLIDE_16_9.width ? "screen16x9" : "screen4x3"}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
}

function themeXml(colors: { accent: string; ink: string; soft: string; onAccent: string }, font: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="StudyAI"><a:themeElements><a:clrScheme name="StudyAI"><a:dk1><a:srgbClr val="${colors.ink}"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="${colors.ink}"/></a:dk2><a:lt2><a:srgbClr val="${colors.soft}"/></a:lt2><a:accent1><a:srgbClr val="${colors.accent}"/></a:accent1><a:accent2><a:srgbClr val="${colors.accent}"/></a:accent2><a:accent3><a:srgbClr val="${colors.accent}"/></a:accent3><a:accent4><a:srgbClr val="${colors.accent}"/></a:accent4><a:accent5><a:srgbClr val="${colors.accent}"/></a:accent5><a:accent6><a:srgbClr val="${colors.accent}"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="StudyAI"><a:majorFont><a:latin typeface="${xml(font)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${xml(font)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="StudyAI"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}

function slideMasterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
}

function notesMasterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notesMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Espaco de Notas"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="pt-BR"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle/></p:notesMaster>`;
}

type SlideContext = {
  theme: StudioTheme;
  width: number;
  height: number;
  title: string;
};

type DiagramArea = { x: number; y: number; w: number; h: number };

/**
 * Desenha o diagrama com formas e conectores nativos do OOXML.
 *
 * Cada nó vira uma forma com texto editável e cada trecho de conexão vira um
 * `p:cxnSp`. Nenhum slide (nem o diagrama) é convertido em imagem: o conteúdo
 * continua editável no PowerPoint.
 */
function drawDiagram(frame: SlideFrame, diagram: DiagramDocument, area: DiagramArea, theme: StudioTheme) {
  const layout = layoutDiagram(diagram);
  if (!layout.nodes.length) return;

  const scale = Math.min(area.w / layout.width, area.h / layout.height);
  const width = layout.width * scale;
  const height = layout.height * scale;
  const offsetX = area.x + (area.w - width) / 2;
  const offsetY = area.y + (area.h - height) / 2;
  const accent = toHexRgb(theme.colors.accent);
  const soft = toHexRgb(theme.colors.accentSoft);
  const ink = toHexRgb(theme.colors.ink);
  const muted = toHexRgb(theme.colors.muted);
  const font = theme.font.pptx;
  const lineWidth = Math.max(0.75, 1.4 * scale * 72);
  const toInches = (value: number) => value * scale;

  layout.edges.forEach((edge) => {
    const points = edge.points;
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      const x1 = offsetX + toInches(start.x);
      const y1 = offsetY + toInches(start.y);
      const x2 = offsetX + toInches(end.x);
      const y2 = offsetY + toInches(end.y);
      const isLast = index === points.length - 2;
      frame.connectors.push({
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1),
        flipH: x2 < x1,
        flipV: y2 < y1,
        line: muted,
        width: lineWidth,
        dashed: edge.dashed,
        arrow: edge.arrow && isLast,
      });
    }
    if (edge.label) {
      const point = edgeLabelPoint(edge);
      frame.texts.push({
        text: edge.label,
        x: offsetX + toInches(point.x) - 0.4,
        y: offsetY + toInches(point.y) - 0.12,
        w: 0.8,
        h: 0.24,
        size: Math.max(7, 11 * scale * 72),
        color: ink,
        font,
        align: "ctr",
        fill: toHexRgb(theme.colors.surface),
      });
    }
  });

  layout.nodes.forEach((node) => {
    const geometry = node.shape === "ellipse"
      ? "ellipse"
      : node.shape === "diamond"
        ? "diamond"
        : node.shape === "rounded" || node.shape === "pill"
          ? "roundRect"
          : "rect";
    const text = [...node.lines, ...node.descriptionLines].join("\n");
    frame.shapes.push({
      x: offsetX + toInches(node.x),
      y: offsetY + toInches(node.y),
      w: toInches(node.width),
      h: toInches(node.height),
      fill: soft,
      line: accent,
      lineWidth,
      geometry,
      text,
      textSize: Math.max(6, node.fontSize * scale * 72),
      textColor: ink,
      font,
      bold: true,
    });
  });
}

function blockText(block: ExportBlock, theme: StudioTheme): { text: string; bullets: boolean; size: number; bold?: boolean; color?: string; mono?: boolean } | null {
  if (block.kind === "paragraph") return { text: plain(block.text), bullets: false, size: 16, color: theme.colors.ink };
  if (block.kind === "example") return { text: plain(block.text), bullets: false, size: 15, color: theme.colors.ink };
  if (block.kind === "summary") return { text: plain(block.text), bullets: false, size: 16, bold: true, color: theme.colors.ink };
  if (block.kind === "quote") return { text: plain(block.text), bullets: false, size: 15, color: theme.colors.muted };
  if (block.kind === "heading") return { text: plain(block.text), bullets: false, size: 20, bold: true, color: theme.colors.accent };
  if (block.kind === "list") {
    const prefix = block.ordered ? "" : "";
    return { text: block.items.map((item) => `${prefix}${plain(item)}`).join("\n"), bullets: true, size: 16, color: theme.colors.ink };
  }
  if (block.kind === "code") return { text: block.code, bullets: false, size: 13, color: theme.colors.ink, mono: true };
  if (block.kind === "diagram") {
    if (block.diagram) return null;
    return { text: block.source, bullets: false, size: 13, color: theme.colors.ink, mono: true };
  }
  if (block.kind === "exercise") {
    const parts = [block.question];
    if (block.guidance) parts.push(`Dica: ${block.guidance}`);
    if (block.answer) parts.push(`Resposta: ${block.answer}`);
    return { text: parts.join("\n"), bullets: false, size: 16, color: theme.colors.ink };
  }
  return null;
}

function buildSlide(slide: ExportDeckModel["slides"][number], context: SlideContext): SlideFrame {
  const { theme, width, height } = context;
  const accent = toHexRgb(theme.colors.accent);
  const soft = toHexRgb(theme.colors.accentSoft);
  const ink = toHexRgb(theme.colors.ink);
  const muted = toHexRgb(theme.colors.muted);
  const onAccent = toHexRgb(theme.colors.onAccent);
  const surface = toHexRgb(theme.colors.surface);
  const font = theme.font.pptx;
  const mono = theme.font.mono ? font : "Consolas";
  const frame: SlideFrame = { background: surface, texts: [], shapes: [], tables: [], connectors: [], notes: slide.notes };
  const margin = 0.7;
  const contentWidth = width - margin * 2;
  const diagram = slide.diagram ?? slide.blocks.find((block): block is Extract<ExportBlock, { kind: "diagram" }> => block.kind === "diagram" && Boolean(block.diagram))?.diagram;

  const titleText = (): PptxText => ({
    text: plain(slide.title) || "Slide",
    x: margin,
    y: 0.42,
    w: contentWidth,
    h: 0.9,
    size: 28,
    bold: true,
    color: accent,
    font,
  });

  if (slide.layout === "cover") {
    frame.background = accent;
    frame.shapes.push({ x: 0, y: 0, w: width, h: 0.16, fill: onAccent });
    frame.texts.push({ text: "STUDYAI ACADEMY", x: margin, y: 0.85, w: 6, h: 0.4, size: 12, bold: true, color: onAccent, font });
    frame.texts.push({ text: plain(slide.title), x: margin, y: 1.7, w: contentWidth, h: 2.2, size: 40, bold: true, color: onAccent, font });
    const subtitle = slide.blocks.find((block) => block.kind === "paragraph");
    if (subtitle) frame.texts.push({ text: plain(subtitle.text), x: margin, y: 4.1, w: contentWidth, h: 1.1, size: 18, color: onAccent, font });
    frame.texts.push({ text: "Academy Studio", x: margin, y: height - 0.9, w: 6, h: 0.3, size: 10, color: onAccent, font });
    return frame;
  }

  frame.texts.push(titleText());
  frame.shapes.push({ x: margin, y: 1.28, w: contentWidth, h: 0.03, fill: accent });

  const textBlocks = slide.blocks.map((block) => blockText(block, theme)).filter((value): value is NonNullable<typeof value> => Boolean(value));
  const tables = slide.blocks.filter((block): block is Extract<ExportBlock, { kind: "table" }> => block.kind === "table");

  if (slide.layout === "two-column" || slide.layout === "comparison") {
    const columnWidth = (contentWidth - 0.5) / 2;
    const half = Math.ceil(textBlocks.length / 2);
    const left = textBlocks.slice(0, half);
    const right = textBlocks.slice(half);
    if (slide.layout === "comparison") {
      const leftHeader = left.length ? left[0].text.split("\n")[0] : "Aspecto A";
      const rightHeader = right.length ? right[0].text.split("\n")[0] : "Aspecto B";
      frame.shapes.push({ x: margin, y: 1.55, w: columnWidth, h: 0.55, fill: accent });
      frame.shapes.push({ x: margin + columnWidth + 0.5, y: 1.55, w: columnWidth, h: 0.55, fill: accent });
      frame.texts.push({ text: leftHeader, x: margin + 0.15, y: 1.66, w: columnWidth - 0.3, h: 0.34, size: 15, bold: true, color: onAccent, font });
      frame.texts.push({ text: rightHeader, x: margin + columnWidth + 0.65, y: 1.66, w: columnWidth - 0.3, h: 0.34, size: 15, bold: true, color: onAccent, font });
      const leftBody = left.map((block) => block.text.split("\n").slice(1).join("\n")).filter(Boolean).join("\n");
      const rightBody = right.map((block) => block.text.split("\n").slice(1).join("\n")).filter(Boolean).join("\n");
      frame.texts.push({ text: leftBody, x: margin, y: 2.25, w: columnWidth, h: height - 3.1, size: 16, color: ink, font, bullets: left.some((block) => block.bullets) });
      frame.texts.push({ text: rightBody, x: margin + columnWidth + 0.5, y: 2.25, w: columnWidth, h: height - 3.1, size: 16, color: ink, font, bullets: right.some((block) => block.bullets) });
      return frame;
    }
    frame.texts.push({ text: left.map((block) => block.text).join("\n"), x: margin, y: 1.55, w: columnWidth, h: height - 2.4, size: 16, color: ink, font, bullets: left.some((block) => block.bullets) });
    frame.texts.push({ text: right.map((block) => block.text).join("\n"), x: margin + columnWidth + 0.5, y: 1.55, w: columnWidth, h: height - 2.4, size: 16, color: ink, font, bullets: right.some((block) => block.bullets) });
    return frame;
  }

  if (slide.layout === "image-text") {
    const textWidth = contentWidth * 0.55;
    frame.texts.push({ text: textBlocks.map((block) => block.text).join("\n"), x: margin, y: 1.6, w: textWidth, h: height - 2.5, size: 16, color: ink, font, bullets: textBlocks.some((block) => block.bullets) });
    frame.shapes.push({ x: margin + textWidth + 0.4, y: 1.6, w: contentWidth - textWidth - 0.4, h: height - 2.5, fill: soft, line: accent, lineWidth: 1 });
    frame.texts.push({ text: "Imagem", x: margin + textWidth + 0.4, y: 1.6 + (height - 2.5) / 2 - 0.2, w: contentWidth - textWidth - 0.4, h: 0.4, size: 14, color: muted, align: "ctr", font });
    return frame;
  }

  if (slide.layout === "diagram" || slide.layout === "code") {
    if (slide.layout === "diagram" && diagram) {
      drawDiagram(frame, diagram, { x: margin, y: 1.5, w: contentWidth, h: height - 2.2 }, theme);
      if (diagram.caption) {
        frame.texts.push({ text: diagram.caption, x: margin, y: height - 0.62, w: contentWidth, h: 0.28, size: 10, color: muted, font, align: "ctr" });
      }
      return frame;
    }
    const code = textBlocks.find((block) => block.mono)?.text ?? "";
    frame.shapes.push({ x: margin, y: 1.6, w: contentWidth, h: height - 2.5, fill: soft, line: accent, lineWidth: 1 });
    frame.texts.push({
      text: code || (slide.layout === "diagram" ? "Diagrama sem fonte editavel" : "Codigo"),
      x: margin + 0.25,
      y: 1.85,
      w: contentWidth - 0.5,
      h: height - 3,
      size: 13,
      color: ink,
      font: mono,
    });
    if (slide.layout === "diagram") {
      frame.texts.push({ text: "Fonte editavel do diagrama (nao convertida em imagem).", x: margin, y: height - 0.8, w: contentWidth, h: 0.3, size: 10, color: muted, font });
    }
    return frame;
  }

  if (slide.layout === "exercise") {
    const exercise = slide.blocks.find((block): block is Extract<ExportBlock, { kind: "exercise" }> => block.kind === "exercise");
    frame.shapes.push({ x: margin, y: 1.6, w: contentWidth, h: 1.5, fill: soft, radius: true });
    frame.texts.push({ text: plain(exercise?.question ?? "Exercicio"), x: margin + 0.3, y: 1.85, w: contentWidth - 0.6, h: 1, size: 19, bold: true, color: accent, font });
    if (exercise?.guidance) frame.texts.push({ text: `Dica: ${plain(exercise.guidance)}`, x: margin, y: 3.4, w: contentWidth, h: 0.8, size: 15, color: muted, font });
    if (exercise?.answer) frame.texts.push({ text: `Resposta: ${plain(exercise.answer)}`, x: margin, y: 4.3, w: contentWidth, h: 1.2, size: 16, color: ink, font });
    return frame;
  }

  if (slide.layout === "summary") {
    frame.shapes.push({ x: margin, y: 1.6, w: contentWidth, h: height - 2.5, fill: soft, radius: true });
    frame.texts.push({ text: textBlocks.map((block) => block.text).join("\n"), x: margin + 0.35, y: 1.9, w: contentWidth - 0.7, h: height - 3.1, size: 16, color: ink, font, bullets: textBlocks.some((block) => block.bullets) });
    return frame;
  }

  if (slide.layout === "blank") {
    frame.texts.push({ text: textBlocks.map((block) => block.text).join("\n"), x: margin, y: 1.6, w: contentWidth, h: height - 2.5, size: 16, color: ink, font, bullets: textBlocks.some((block) => block.bullets) });
    return frame;
  }

  // title-content (padrão) e demais variações com corpo único.
  let cursor = 1.6;
  const tableBlocks = tables;
  const bodyBlocks = textBlocks.filter((block) => !block.mono);
  if (bodyBlocks.length) {
    const available = tableBlocks.length ? height - 2.5 - Math.min(2.2, tableBlocks.length * 1.6) : height - 2.5;
    const bodyHeight = diagram ? Math.max(1.2, Math.min(1.9, available - 2.9)) : available;
    frame.texts.push({
      text: bodyBlocks.map((block) => block.text).join("\n"),
      x: margin,
      y: cursor,
      w: contentWidth,
      h: Math.max(1.4, bodyHeight),
      size: 16,
      color: ink,
      font,
      bullets: bodyBlocks.some((block) => block.bullets),
    });
    cursor += Math.max(1.4, bodyHeight) + 0.2;
  }
  tableBlocks.forEach((table) => {
    frame.tables.push({
      x: margin,
      y: cursor,
      w: contentWidth,
      h: Math.min(2.2, (table.rows.length + 1) * 0.5),
      header: table.header,
      rows: table.rows,
      headerFill: accent,
      bodyFill: surface,
      line: toHexRgb(theme.colors.border),
      color: ink,
      headerColor: onAccent,
      font,
    });
    cursor += Math.min(2.2, (table.rows.length + 1) * 0.5) + 0.2;
  });
  if (diagram) {
    const top = Math.min(height - 2.6, cursor + 0.05);
    drawDiagram(frame, diagram, { x: margin, y: top, w: contentWidth, h: Math.max(1.2, height - top - 0.55) }, theme);
    if (diagram.caption) {
      frame.texts.push({ text: diagram.caption, x: margin, y: height - 0.55, w: contentWidth, h: 0.26, size: 10, color: muted, font, align: "ctr" });
    }
  }
  if (slide.layout === "title-content" && !bodyBlocks.length && !tableBlocks.length && !diagram) {
    frame.texts.push({ text: "Sem conteudo", x: margin, y: 1.8, w: contentWidth, h: 0.6, size: 16, color: muted, font });
  }
  return frame;
}

export const StudioPptxExporter = {
  async generate(model: ExportDeckModel, customization: StudioCustomization): Promise<StudioPptxResult> {
    const theme = resolveStudioTheme(customization);
    const accent = toHexRgb(theme.colors.accent);
    const soft = toHexRgb(theme.colors.accentSoft);
    const ink = toHexRgb(theme.colors.ink);
    const onAccent = toHexRgb(theme.colors.onAccent);
    const size = customization.orientation === "landscape" ? SLIDE_16_9 : SLIDE_4_3;
    const width = size.width / EMU;
    const height = size.height / EMU;

    const frames = model.slides.map((slide) => buildSlide(slide, { theme, width, height, title: slide.title }));
    const zip = new JSZip();
    zip.file("[Content_Types].xml", contentTypes(frames.length));
    zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
    zip.folder("docProps")?.file("core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(model.title)}</dc:title><dc:subject>${xml(model.subtitle ?? "Academy Studio")}</dc:subject><dc:creator>${xml(model.author ?? "StudyAI Academy")}</dc:creator><cp:lastModifiedBy>StudyAI Academy</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
    zip.folder("docProps")?.file("app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>StudyAI Academy Studio</Application><PresentationFormat>${size === SLIDE_16_9 ? "Widescreen" : "On-screen Show (4:3)"}</PresentationFormat><Slides>${frames.length}</Slides><Company>StudyAI</Company></Properties>`);
    zip.folder("ppt")?.file("presentation.xml", presentationXml(frames.length, size));
    const presentationRels = [
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
      ...frames.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`),
      `<Relationship Id="rId${frames.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/>`,
      `<Relationship Id="rId${frames.length + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`,
    ].join("");
    zip.folder("ppt/_rels")?.file("presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presentationRels}</Relationships>`);

    frames.forEach((frame, index) => {
      zip.folder("ppt/slides")?.file(`slide${index + 1}.xml`, slideXml(frame));
      zip.folder("ppt/slides/_rels")?.file(`slide${index + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${index + 1}.xml"/></Relationships>`);
      zip.folder("ppt/notesSlides")?.file(`notesSlide${index + 1}.xml`, notesXml(frame.notes ?? ""));
      zip.folder("ppt/notesSlides/_rels")?.file(`notesSlide${index + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${index + 1}.xml"/></Relationships>`);
    });

    zip.folder("ppt/slideMasters")?.file("slideMaster1.xml", slideMasterXml());
    zip.folder("ppt/slideMasters/_rels")?.file("slideMaster1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/></Relationships>`);
    zip.folder("ppt/slideLayouts")?.file("slideLayout1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
    zip.folder("ppt/slideLayouts/_rels")?.file("slideLayout1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
    zip.folder("ppt/notesMasters")?.file("notesMaster1.xml", notesMasterXml());
    zip.folder("ppt/notesMasters/_rels")?.file("notesMaster1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme2.xml"/></Relationships>`);
    zip.folder("ppt/theme")?.file("theme1.xml", themeXml({ accent, ink, soft, onAccent }, theme.font.pptx));
    zip.folder("ppt/theme")?.file("theme2.xml", themeXml({ accent, ink, soft, onAccent }, theme.font.pptx));

    const blob = await zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      compression: "DEFLATE",
    });
    return { blob, fileName: `${studioFileStem(model.title)}-studio.pptx`, slideCount: frames.length };
  },
};

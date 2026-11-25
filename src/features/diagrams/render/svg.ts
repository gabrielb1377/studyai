/**
 * Serialização SVG dos diagramas.
 *
 * O SVG é construído a partir do modelo estruturado (nunca de marcação recebida
 * de fora): não há `<script>`, `foreignObject`, manipuladores de evento, URLs
 * externas ou imagens embutidas. Os textos são escapados, e `validateSvgMarkup`
 * confirma essas garantias antes de qualquer download.
 */

import { DIAGRAM_LIMITS } from "../limits";
import { edgeLabelPoint, layoutDiagram, measureDiagramText } from "../layout";
import {
  defaultDiagramTheme,
  type DiagramDocument,
  type DiagramLayout,
  type DiagramTheme,
  type LaidOutEdge,
  type LaidOutNode,
} from "../types";

export type SvgRenderOptions = {
  theme?: Partial<DiagramTheme>;
  /** `false` gera fundo transparente. */
  background?: boolean;
  /** Multiplicador aplicado apenas a width/height (viewBox é preservado). */
  scale?: number;
  fontFamily?: string;
  /** Sobrescreve a legenda do diagrama; string vazia remove a legenda. */
  caption?: string;
};

const CAPTION_HEIGHT = 30;

export function escapeXml(value: string): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function number(value: number): string {
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(2)).toString();
}

function resolveTheme(partial?: Partial<DiagramTheme>): DiagramTheme {
  return { ...defaultDiagramTheme, ...(partial ?? {}) };
}

function pathFor(edge: LaidOutEdge): string {
  const [start, ...rest] = edge.points;
  if (!start || !rest.length) return "";
  if (edge.mode === "curve" && rest.length >= 2) {
    const control = rest[0];
    const end = rest[rest.length - 1];
    return `M${number(start.x)},${number(start.y)} Q${number(control.x)},${number(control.y)} ${number(end.x)},${number(end.y)}`;
  }
  return `M${number(start.x)},${number(start.y)} ${rest.map((point) => `L${number(point.x)},${number(point.y)}`).join(" ")}`;
}

function nodeShape(node: LaidOutNode, theme: DiagramTheme): string {
  const fill = theme.accentSoft;
  const stroke = theme.accent;
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="1.5"`;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  if (node.shape === "ellipse") {
    return `<ellipse cx="${number(cx)}" cy="${number(cy)}" rx="${number(node.width / 2)}" ry="${number(node.height / 2)}" ${common}/>`;
  }
  if (node.shape === "diamond") {
    const top = `${number(cx)},${number(node.y)}`;
    const right = `${number(node.x + node.width)},${number(cy)}`;
    const bottom = `${number(cx)},${number(node.y + node.height)}`;
    const left = `${number(node.x)},${number(cy)}`;
    return `<path d="M${top} L${right} L${bottom} L${left} Z" ${common}/>`;
  }
  const radius = node.shape === "pill" ? node.height / 2 : node.shape === "rounded" ? 12 : 5;
  return `<rect x="${number(node.x)}" y="${number(node.y)}" width="${number(node.width)}" height="${number(node.height)}" rx="${number(radius)}" ry="${number(radius)}" ${common}/>`;
}

function nodeText(node: LaidOutNode, theme: DiagramTheme): string {
  const total = node.lines.length * 18 + (node.descriptionLines.length ? node.descriptionLines.length * 15 + 4 : 0);
  let baseline = node.y + node.height / 2 - total / 2 + 14;
  const x = node.x + node.width / 2;
  const labels = node.lines.map((line) => {
    const element = `<tspan x="${number(x)}" y="${number(baseline)}">${escapeXml(line)}</tspan>`;
    baseline += 18;
    return element;
  }).join("");
  const descriptions = node.descriptionLines.map((line) => {
    baseline += 0;
    const element = `<tspan x="${number(x)}" y="${number(baseline + 2)}">${escapeXml(line)}</tspan>`;
    baseline += 15;
    return element;
  }).join("");
  const labelText = `<text text-anchor="middle" font-size="${node.fontSize}" font-weight="600" fill="${theme.ink}">${labels}</text>`;
  const descriptionText = node.descriptionLines.length
    ? `<text text-anchor="middle" font-size="${node.descriptionFontSize}" fill="${theme.muted}">${descriptions}</text>`
    : "";
  return labelText + descriptionText;
}

function edgeMarkup(edge: LaidOutEdge, theme: DiagramTheme): string {
  const path = pathFor(edge);
  if (!path) return "";
  const dash = edge.dashed ? ' stroke-dasharray="6 5"' : "";
  const marker = edge.arrow ? ' marker-end="url(#diagram-arrow)"' : "";
  const stroke = `stroke="${theme.muted}" stroke-width="1.6" fill="none"${dash}${marker}`;
  const label = edge.label ? edgeLabelMarkup(edge, theme) : "";
  return `<g class="diagram-edge"><path d="${path}" ${stroke}/>${label}</g>`;
}

function edgeLabelMarkup(edge: LaidOutEdge, theme: DiagramTheme): string {
  const label = edge.label ?? "";
  const point = edgeLabelPoint(edge);
  const width = measureDiagramText(label, 11) + 12;
  const height = 18;
  return `<g class="diagram-edge-label"><rect x="${number(point.x - width / 2)}" y="${number(point.y - height / 2)}" width="${number(width)}" height="${number(height)}" rx="4" fill="${theme.surface}" stroke="${theme.border}" stroke-width="1"/><text x="${number(point.x)}" y="${number(point.y + 4)}" text-anchor="middle" font-size="11" fill="${theme.ink}">${escapeXml(label)}</text></g>`;
}

/** Gera o SVG completo do diagrama a partir do modelo. */
export function renderDiagramSvg(
  diagram: DiagramDocument,
  options: SvgRenderOptions = {},
): { svg: string; width: number; height: number; layout: DiagramLayout } {
  const theme = resolveTheme(options.theme);
  const layout = layoutDiagram(diagram);
  const caption = options.caption ?? diagram.caption ?? "";
  const extra = caption ? CAPTION_HEIGHT : 0;
  const width = layout.width;
  const height = layout.height + extra;
  const scale = Math.min(Math.max(options.scale ?? 1, 0.25), 4);
  const fontFamily = options.fontFamily ?? '"Aptos", "Segoe UI", system-ui, sans-serif';

  const background = options.background === false
    ? ""
    : `<rect x="0" y="0" width="${number(width)}" height="${number(height)}" fill="${theme.surface}"/>`;

  const arrows = `<defs><marker id="diagram-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="${theme.muted}"/></marker></defs>`;

  const edges = layout.edges.map((edge) => edgeMarkup(edge, theme)).join("");
  const nodes = layout.nodes.map((node) => `<g class="diagram-node">${nodeShape(node, theme)}${nodeText(node, theme)}</g>`).join("");
  const captionMarkup = caption
    ? `<text x="${number(width / 2)}" y="${number(height - 10)}" text-anchor="middle" font-size="11" fill="${theme.muted}">${escapeXml(caption)}</text>`
    : "";

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${number(width * scale)}" height="${number(height * scale)}" viewBox="0 0 ${number(width)} ${number(height)}" role="img" aria-labelledby="diagram-title diagram-desc" font-family="${escapeXml(fontFamily)}">`,
    `<title id="diagram-title">${escapeXml(diagram.title)}</title>`,
    `<desc id="diagram-desc">${escapeXml(`${diagram.type} com ${layout.nodes.length} nós e ${layout.edges.length} conexões.`)}</desc>`,
    arrows,
    background,
    `<g class="diagram-edges">${edges}</g>`,
    `<g class="diagram-nodes">${nodes}</g>`,
    captionMarkup,
    "</svg>",
  ].join("");

  if (svg.length > DIAGRAM_LIMITS.maxSvgBytes) {
    throw new Error("O diagrama é grande demais para exportação segura. Reduza o número de nós ou de texto.");
  }
  return { svg, width, height, layout };
}

const FORBIDDEN_SVG_PATTERNS: Array<{ pattern: RegExp; issue: string }> = [
  { pattern: /<\s*script/i, issue: "Script embutido." },
  { pattern: /<\s*foreignObject/i, issue: "foreignObject não é permitido." },
  { pattern: /<\s*(image|iframe|object|embed|use|animate|style|link|meta|base)\b/i, issue: "Elemento externo não é permitido." },
  { pattern: /\son[a-z]+\s*=/i, issue: "Manipulador de evento inline." },
  { pattern: /javascript\s*:/i, issue: "URL javascript:." },
  { pattern: /data\s*:/i, issue: "URL data: não é permitida." },
  { pattern: /url\(\s*['"]?(?!#)/i, issue: "Referência externa em url()." },
  { pattern: /href\s*=\s*["'](?!#)/i, issue: "Atributo href externo." },
];

/** Lista problemas de segurança/encontra markup inválido. Vazio significa seguro. */
export function validateSvgMarkup(svg: string): string[] {
  const issues: string[] = [];
  if (!svg.trim().startsWith("<svg")) issues.push("O documento não começa com <svg>.");
  if (!svg.trim().endsWith("</svg>")) issues.push("O documento não termina com </svg>.");
  if (!/viewBox="[^"]+"/.test(svg)) issues.push("viewBox ausente.");
  for (const { pattern, issue } of FORBIDDEN_SVG_PATTERNS) {
    if (pattern.test(svg)) issues.push(issue);
  }
  // A única URL http(s) aceita é o namespace do SVG. Textos são escapados antes
  // de entrar no documento, então URLs dentro de rótulos não são referências.
  const urls = svg.match(/https?:\/\/[^"'\s)>]+/gi) ?? [];
  if (urls.some((url) => url !== "http://www.w3.org/2000/svg")) {
    const attributeUrls = svg.match(/(?:href|src|content)\s*=\s*["'][^"']*https?:\/\/[^"']*["']/gi) ?? [];
    if (attributeUrls.length) issues.push("URL externa em atributo do SVG.");
  }
  return issues;
}

/** Serializa o diagrama como fonte Mermaid editável (subconjunto suportado). */
export function toMermaidSource(diagram: DiagramDocument): string {
  const header = `flowchart ${diagram.direction}`;
  const nodes = diagram.nodes.map((node) => {
    const id = mermaidSafeId(node.id);
    const label = node.label.replace(/[[\]{}()|"]/g, " ").replace(/\s+/g, " ").trim();
    const open = node.shape === "diamond" ? "{" : node.shape === "ellipse" ? "((" : node.shape === "rounded" || node.shape === "pill" ? "(" : "[";
    const close = node.shape === "diamond" ? "}" : node.shape === "ellipse" ? "))" : node.shape === "rounded" || node.shape === "pill" ? ")" : "]";
    return `  ${id}${open}${label}${close}`;
  });
  const edges = diagram.edges.map((edge) => {
    const label = edge.label ? `|${edge.label.replace(/\|/g, " ")}|` : "";
    const connector = edge.style === "dashed" ? "-.->" : "-->";
    return `  ${mermaidSafeId(edge.from)} ${connector}${label} ${mermaidSafeId(edge.to)}`;
  });
  return [header, ...nodes, ...edges].join("\n");
}

function mermaidSafeId(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "n$1");
  return cleaned || "node";
}

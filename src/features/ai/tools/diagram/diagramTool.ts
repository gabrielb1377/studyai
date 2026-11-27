/**
 * StudyAI — Tool Engine (TE-5)
 * Ferramenta canônica de geração estruturada e segura de diagramas (`diagram@0.1.0`).
 *
 * Conforme STUDYAI_TOOL_ENGINE.md §3–§5 e §7:
 * - Classe oficial: `transform` (`requiresConfirmation: false` — sem escrita em storage).
 * - Reutiliza `diagrams/parse/mermaid.ts`, `diagrams/limits.ts`, `diagrams/render/svg.ts`
 *   e `diagrams/types.ts` (não carrega pacote externo `mermaid`, não faz chamadas de IA).
 * - Bloqueia diretivas Mermaid (`%%{...}%%`), `click`, callbacks, links perigosos,
 *   HTML/SVG/script em labels, event handlers, URLs externas e configuração injetada.
 * - Aplica configuração fixa confiável de renderização SVG e valida o SVG resultante
 *   com `validateSvgMarkup`.
 * - Sempre fornece fallback textual seguro (`textualFallback`).
 */

import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { DIAGRAM_LIMITS, normalizeDiagram } from "@/features/diagrams/limits";
import { parseMermaid } from "@/features/diagrams/parse/mermaid";
import { renderDiagramSvg, toMermaidSource, validateSvgMarkup } from "@/features/diagrams/render/svg";
import { diagramTypes, type DiagramDocument, type DiagramType } from "@/features/diagrams/types";
import type { ToolExecutorFn, ToolSpec } from "../types";

export const DIAGRAM_TOOL_MAX_SOURCE_CHARS = 8_192;
export const DIAGRAM_TOOL_MAX_NODES = 25;
export const DIAGRAM_TOOL_MAX_EDGES = 40;
export const DIAGRAM_TOOL_MAX_SVG_CHARS = 12_288;

export interface DiagramToolOutput {
  readonly status: "rendered_svg" | "fallback_text";
  readonly diagramType: string;
  readonly direction: "TB" | "LR";
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly svgValidated: boolean;
  readonly canonicalMermaid?: string;
  readonly svg?: string;
  readonly textualFallback: string;
  readonly issues: readonly string[];
}

const DANGEROUS_DIAGRAM_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly issue: string }> = [
  { pattern: /%%\{[\s\S]*?\}%%/i, issue: "Diretivas de configuração Mermaid (%%{init:...}%%) são bloqueadas." },
  { pattern: /(?:^|\n)\s*click\s+/i, issue: "Diretiva Mermaid 'click' e callbacks são bloqueados." },
  { pattern: /(?:^|\n)\s*(?:classDef|class|style|linkStyle)\s+/i, issue: "Estilização/injeção CSS Mermaid não é permitida." },
  { pattern: /\b(?:javascript|vbscript)\s*:/i, issue: "URL executável (javascript:/vbscript:) bloqueada." },
  { pattern: /\bdata\s*:\s*(?:text\/html|image\/svg\+xml|application\/)/i, issue: "URL data: ativa bloqueada." },
  { pattern: /https?:\/\/|(?<![:\w])\/\/[a-z0-9.-]+/i, issue: "URLs externas não são permitidas em diagramas." },
  { pattern: /<\s*\/?\s*(?:script|iframe|svg|img|object|embed|style|link|meta|base|a|foreignObject|math|form|input|button|body|html)\b/i, issue: "Marcação HTML/SVG ativa em rótulos é bloqueada." },
  { pattern: /<\s*[a-zA-Z!/?][^>]*>/, issue: "Tags HTML arbitrárias em rótulos não são permitidas." },
  { pattern: /\bon[a-z]{2,}\s*=/i, issue: "Manipuladores de evento inline (on*=) são bloqueados." },
  { pattern: /\b(?:href|xlink:href|src|srcdoc|callback|securityLevel)\s*[:=]/i, issue: "Atributos de redirecionamento, callback ou configuração de segurança bloqueados." },
];

function scanDangerousContent(text: string): string[] {
  const issues: string[] = [];
  for (const rule of DANGEROUS_DIAGRAM_PATTERNS) {
    if (rule.pattern.test(text)) {
      issues.push(rule.issue);
    }
  }
  return issues;
}

function buildTextualFallback(diagram: DiagramDocument): string {
  const header = `Diagrama (${diagram.type}, ${diagram.direction}): ${diagram.title}`;
  const nodeLines = diagram.nodes
    .slice(0, DIAGRAM_TOOL_MAX_NODES)
    .map((n, idx) => `${idx + 1}. ${n.label}${n.description ? ` — ${n.description}` : ""}`);
  const nodeLabelById = new Map(diagram.nodes.map((n) => [n.id, n.label]));
  const edgeLines = diagram.edges.slice(0, DIAGRAM_TOOL_MAX_EDGES).map((e) => {
    const fromLabel = nodeLabelById.get(e.from) ?? e.from;
    const toLabel = nodeLabelById.get(e.to) ?? e.to;
    return e.label ? `- ${fromLabel} --(${e.label})--> ${toLabel}` : `- ${fromLabel} --> ${toLabel}`;
  });
  const parts = [header, ...nodeLines];
  if (edgeLines.length > 0) {
    parts.push("Conexões:", ...edgeLines);
  }
  return parts.join("\n").slice(0, 2000);
}

function makeFallbackResult(params: {
  readonly diagramType: string;
  readonly direction: "TB" | "LR";
  readonly issues: readonly string[];
  readonly fallbackText?: string;
}): Record<string, unknown> {
  return {
    status: "fallback_text",
    diagramType: params.diagramType.slice(0, 40),
    direction: params.direction,
    nodeCount: 0,
    edgeCount: 0,
    svgValidated: false,
    textualFallback: (
      params.fallbackText ??
      "Não foi possível renderizar o diagrama com segurança; utilize a explicação textual estruturada em passos."
    ).slice(0, 2000),
    issues: params.issues.slice(0, 8).map((i) => i.slice(0, 200)),
  } satisfies DiagramToolOutput as unknown as Record<string, unknown>;
}

export const diagramToolSpec: ToolSpec = {
  id: "diagram",
  version: "0.1.0",
  class: "transform",
  description:
    "Valida e converte especificações Mermaid (subconjunto seguro) ou estruturadas em diagrama canônico e SVG escapado, com fallback textual seguro e sem recursos externos.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["format"],
    properties: {
      format: { type: "string", enum: ["mermaid", "structured"] },
      title: { type: "string", minLength: 1, maxLength: 120 },
      type: { type: "string", minLength: 1, maxLength: 40 },
      direction: { type: "string", enum: ["TB", "LR"] },
      source: { type: "string", minLength: 1, maxLength: DIAGRAM_TOOL_MAX_SOURCE_CHARS },
      nodes: {
        type: "array",
        maxItems: DIAGRAM_TOOL_MAX_NODES,
        items: {
          type: "object",
          required: ["id", "label"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 64 },
            label: { type: "string", minLength: 1, maxLength: DIAGRAM_LIMITS.maxLabelLength },
            description: { type: "string", maxLength: DIAGRAM_LIMITS.maxDescriptionLength },
            shape: { type: "string", enum: ["box", "rounded", "diamond", "ellipse", "pill"] },
            group: { type: "string", maxLength: 48 },
          },
        },
      },
      edges: {
        type: "array",
        maxItems: DIAGRAM_TOOL_MAX_EDGES,
        items: {
          type: "object",
          required: ["from", "to"],
          properties: {
            from: { type: "string", minLength: 1, maxLength: 64 },
            to: { type: "string", minLength: 1, maxLength: 64 },
            label: { type: "string", maxLength: DIAGRAM_LIMITS.maxEdgeLabelLength },
            style: { type: "string", enum: ["solid", "dashed", "curve"] },
            arrow: { type: "boolean" },
          },
        },
      },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: [
      "status",
      "diagramType",
      "direction",
      "nodeCount",
      "edgeCount",
      "svgValidated",
      "textualFallback",
      "issues",
    ],
    properties: {
      status: { type: "string", enum: ["rendered_svg", "fallback_text"] },
      diagramType: { type: "string", maxLength: 40 },
      direction: { type: "string", enum: ["TB", "LR"] },
      nodeCount: { type: "number", min: 0, max: DIAGRAM_TOOL_MAX_NODES },
      edgeCount: { type: "number", min: 0, max: DIAGRAM_TOOL_MAX_EDGES },
      svgValidated: { type: "boolean" },
      canonicalMermaid: { type: "string", maxLength: 4000 },
      svg: { type: "string", maxLength: DIAGRAM_TOOL_MAX_SVG_CHARS },
      textualFallback: { type: "string", maxLength: 2000 },
      issues: {
        type: "array",
        maxItems: 8,
        items: { type: "string", maxLength: 200 },
      },
    },
  },
  scope: {
    requiredScopes: ["account", "study"],
    crossAccountAllowed: false,
  },
  limits: {
    timeoutMs: 2500,
    maxInputBytes: 10240,
    maxOutputBytes: 16384,
    maxItems: DIAGRAM_TOOL_MAX_EDGES,
    maxDepth: 6,
    maxCallsPerTurn: 2,
  },
  requiresConfirmation: false,
  audit: {
    recordDuration: true,
    includeStudentContent: false,
    allowedMetadataFields: ["toolId", "toolVersion", "toolClass", "status", "denialReason", "durationMs"],
  },
  tests: {
    deterministicFixtures: true,
    description:
      "Valida sanitização Mermaid/estruturada, bloqueio de HTML/scripts/diretivas/URLs, limites de complexidade e fallback textual.",
  },
  available: true,
};

export const executeDiagramTool: ToolExecutorFn = async (args, context) => {
  const operation = SessionOperationManager.start(context.userId);
  try {
    operation.assertCurrent();
    const format = args.format === "structured" ? "structured" : "mermaid";
    const title = typeof args.title === "string" ? args.title.trim() : "Diagrama conceitual";
    const requestedDirection: "TB" | "LR" = args.direction === "LR" ? "LR" : "TB";

    const titleIssues = scanDangerousContent(title);
    if (titleIssues.length > 0) {
      return makeFallbackResult({
        diagramType: typeof args.type === "string" ? args.type : "flowchart",
        direction: requestedDirection,
        issues: titleIssues,
      });
    }

    let diagram: DiagramDocument;

    if (format === "mermaid") {
      const source = typeof args.source === "string" ? args.source : "";
      if (!source.trim()) {
        return makeFallbackResult({
          diagramType: "flowchart",
          direction: requestedDirection,
          issues: ["Código Mermaid ausente ou vazio."],
        });
      }
      if (source.length > DIAGRAM_TOOL_MAX_SOURCE_CHARS) {
        return makeFallbackResult({
          diagramType: "flowchart",
          direction: requestedDirection,
          issues: [`Código Mermaid excede o limite de ${DIAGRAM_TOOL_MAX_SOURCE_CHARS} caracteres.`],
        });
      }

      const securityIssues = scanDangerousContent(source);
      if (securityIssues.length > 0) {
        return makeFallbackResult({
          diagramType: "flowchart",
          direction: requestedDirection,
          issues: securityIssues,
        });
      }

      const parsed = parseMermaid(source, { title });
      if (!parsed.ok || !parsed.diagram) {
        return makeFallbackResult({
          diagramType: "flowchart",
          direction: requestedDirection,
          issues: parsed.issues.length > 0 ? parsed.issues : ["Sintaxe Mermaid não suportada."],
        });
      }

      if (parsed.diagram.nodes.length > DIAGRAM_TOOL_MAX_NODES) {
        return makeFallbackResult({
          diagramType: parsed.diagram.type,
          direction: parsed.diagram.direction,
          issues: [`Diagrama excede o máximo de ${DIAGRAM_TOOL_MAX_NODES} nós.`],
          fallbackText: buildTextualFallback(parsed.diagram),
        });
      }
      if (parsed.diagram.edges.length > DIAGRAM_TOOL_MAX_EDGES) {
        return makeFallbackResult({
          diagramType: parsed.diagram.type,
          direction: parsed.diagram.direction,
          issues: [`Diagrama excede o máximo de ${DIAGRAM_TOOL_MAX_EDGES} conexões.`],
          fallbackText: buildTextualFallback(parsed.diagram),
        });
      }

      diagram = parsed.diagram;
    } else {
      const rawType = typeof args.type === "string" ? args.type.trim() : "flowchart";
      if (!diagramTypes.includes(rawType as DiagramType)) {
        return makeFallbackResult({
          diagramType: rawType,
          direction: requestedDirection,
          issues: [`Tipo de diagrama não suportado: "${rawType}".`],
        });
      }

      const rawNodes = Array.isArray(args.nodes) ? args.nodes : [];
      const rawEdges = Array.isArray(args.edges) ? args.edges : [];
      if (rawNodes.length === 0) {
        return makeFallbackResult({
          diagramType: rawType,
          direction: requestedDirection,
          issues: ["Diagrama estruturado exige ao menos um nó."],
        });
      }
      if (rawNodes.length > DIAGRAM_TOOL_MAX_NODES || rawEdges.length > DIAGRAM_TOOL_MAX_EDGES) {
        return makeFallbackResult({
          diagramType: rawType,
          direction: requestedDirection,
          issues: ["Complexidade excede os limites de nós ou conexões permitidos."],
        });
      }

      // Escaneia todos os textos estruturados antes da normalização
      const textIssues: string[] = [];
      for (const n of rawNodes) {
        if (!n || typeof n !== "object") continue;
        const rec = n as Record<string, unknown>;
        for (const field of [rec.id, rec.label, rec.description, rec.group]) {
          if (typeof field === "string") {
            textIssues.push(...scanDangerousContent(field));
          }
        }
      }
      for (const e of rawEdges) {
        if (!e || typeof e !== "object") continue;
        const rec = e as Record<string, unknown>;
        for (const field of [rec.from, rec.to, rec.label]) {
          if (typeof field === "string") {
            textIssues.push(...scanDangerousContent(field));
          }
        }
      }
      if (textIssues.length > 0) {
        return makeFallbackResult({
          diagramType: rawType,
          direction: requestedDirection,
          issues: Array.from(new Set(textIssues)),
        });
      }

      diagram = normalizeDiagram({
        title,
        type: rawType as DiagramType,
        direction: requestedDirection,
        layout: "auto",
        source: "ai",
        nodes: rawNodes,
        edges: rawEdges,
      });

      if (diagram.nodes.length === 0) {
        return makeFallbackResult({
          diagramType: rawType,
          direction: requestedDirection,
          issues: ["Nenhum nó válido permaneceu após normalização estrutural."],
        });
      }
    }

    const textualFallback = buildTextualFallback(diagram);
    const canonicalMermaid = toMermaidSource(diagram).slice(0, 4000);

    // Configuração de renderização estritamente fixa e confiável (não controlável pela IA)
    const rendered = renderDiagramSvg(diagram, {
      background: true,
      scale: 1,
      caption: "",
    });

    const svgIssues = validateSvgMarkup(rendered.svg);
    operation.assertCurrent();

    if (svgIssues.length > 0 || rendered.svg.length > DIAGRAM_TOOL_MAX_SVG_CHARS) {
      return makeFallbackResult({
        diagramType: diagram.type,
        direction: diagram.direction,
        issues:
          svgIssues.length > 0
            ? svgIssues
            : [`SVG resultante excedeu o limite seguro de ${DIAGRAM_TOOL_MAX_SVG_CHARS} bytes.`],
        fallbackText: textualFallback,
      });
    }

    return {
      status: "rendered_svg",
      diagramType: diagram.type,
      direction: diagram.direction,
      nodeCount: diagram.nodes.length,
      edgeCount: diagram.edges.length,
      svgValidated: true,
      canonicalMermaid,
      svg: rendered.svg,
      textualFallback,
      issues: [],
    } satisfies DiagramToolOutput as unknown as Record<string, unknown>;
  } finally {
    operation.release();
  }
};

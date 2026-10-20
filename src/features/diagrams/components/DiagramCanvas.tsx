"use client";

import { useId, useMemo, useRef, useState } from "react";
import { edgeLabelPoint, layoutDiagram, measureDiagramText } from "../layout";
import { defaultDiagramTheme, type DiagramDocument, type DiagramTheme, type LaidOutEdge, type LaidOutNode } from "../types";

export type DiagramCanvasProps = {
  diagram: DiagramDocument;
  theme?: Partial<DiagramTheme>;
  className?: string;
  caption?: string;
  editable?: boolean;
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
  onMoveNode?: (nodeId: string, position: { x: number; y: number }) => void;
  ariaLabel?: string;
};

const CAPTION_HEIGHT = 30;

function number(value: number): string {
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(2)).toString();
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

function NodeShape({ node, colors }: { node: LaidOutNode; colors: DiagramTheme }) {
  const common = { fill: colors.accentSoft, stroke: colors.accent, strokeWidth: 1.5 };
  const centerX = node.x + node.width / 2;
  const centerY = node.y + node.height / 2;
  if (node.shape === "ellipse") {
    return <ellipse cx={centerX} cy={centerY} rx={node.width / 2} ry={node.height / 2} {...common} />;
  }
  if (node.shape === "diamond") {
    const points = [
      `${centerX},${node.y}`,
      `${node.x + node.width},${centerY}`,
      `${centerX},${node.y + node.height}`,
      `${node.x},${centerY}`,
    ].join(" ");
    return <polygon points={points} {...common} />;
  }
  const radius = node.shape === "pill" ? node.height / 2 : node.shape === "rounded" ? 12 : 5;
  return <rect x={node.x} y={node.y} width={node.width} height={node.height} rx={radius} ry={radius} {...common} />;
}

function NodeText({ node, colors }: { node: LaidOutNode; colors: DiagramTheme }) {
  const totalHeight = node.lines.length * 18 + (node.descriptionLines.length ? node.descriptionLines.length * 15 + 4 : 0);
  let baseline = node.y + node.height / 2 - totalHeight / 2 + 14;
  const centerX = node.x + node.width / 2;
  const labels = node.lines.map((line, index) => {
    const y = baseline;
    baseline += 18;
    return <tspan key={`l-${index}`} x={centerX} y={y}>{line}</tspan>;
  });
  const descriptions = node.descriptionLines.map((line, index) => {
    const y = baseline + 2 + index * 15;
    return <tspan key={`d-${index}`} x={centerX} y={y}>{line}</tspan>;
  });
  return (
    <>
      <text textAnchor="middle" fontSize={node.fontSize} fontWeight={600} fill={colors.ink}>{labels}</text>
      {descriptions.length ? (
        <text textAnchor="middle" fontSize={node.descriptionFontSize} fill={colors.muted}>{descriptions}</text>
      ) : null}
    </>
  );
}

/**
 * Renderiza o diagrama como SVG nativo do React (sem `dangerouslySetInnerHTML`).
 * Em modo editável, arrastar um nó grava a posição manual; setas do teclado
 * também movem o nó selecionado.
 */
export function DiagramCanvas({
  diagram,
  theme,
  className,
  caption,
  editable = false,
  selectedNodeId,
  onSelectNode,
  onMoveNode,
  ariaLabel,
}: DiagramCanvasProps) {
  const colors = useMemo<DiagramTheme>(() => ({ ...defaultDiagramTheme, ...(theme ?? {}) }), [theme]);
  const layout = useMemo(() => layoutDiagram(diagram), [diagram]);
  const captionText = caption ?? diagram.caption ?? "";
  const height = layout.height + (captionText ? CAPTION_HEIGHT : 0);
  const markerId = `arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; originX: number; originY: number; scale: number } | null>(null);

  const toSvgScale = () => {
    const element = svgRef.current;
    if (!element) return 1;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 ? layout.width / rect.width : 1;
  };

  const beginDrag = (event: React.PointerEvent<SVGGElement>, node: LaidOutNode) => {
    if (!editable) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y,
      scale: toSvgScale(),
    };
    setDrag({ id: node.id, dx: 0, dy: 0 });
    onSelectNode?.(node.id);
  };

  const moveDrag = (event: React.PointerEvent<SVGGElement>) => {
    const current = dragRef.current;
    if (!current) return;
    const dx = (event.clientX - current.startX) * current.scale;
    const dy = (event.clientY - current.startY) * current.scale;
    setDrag({ id: current.id, dx, dy });
  };

  const endDrag = (event: React.PointerEvent<SVGGElement>) => {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!current || !onMoveNode) return;
    const moved = Math.abs(event.clientX - current.startX) + Math.abs(event.clientY - current.startY);
    if (moved < 3) return;
    const dx = (event.clientX - current.startX) * current.scale;
    const dy = (event.clientY - current.startY) * current.scale;
    onMoveNode(current.id, { x: Math.round(current.originX + dx), y: Math.round(current.originY + dy) });
  };

  const nudge = (event: React.KeyboardEvent<SVGGElement>, node: LaidOutNode) => {
    if (!editable || !onMoveNode) return;
    const step = event.shiftKey ? 24 : 8;
    const delta = {
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    onSelectNode?.(node.id);
    onMoveNode(node.id, { x: Math.round(node.x + delta.x), y: Math.round(node.y + delta.y) });
  };

  if (!layout.nodes.length) {
    return (
      <div className={`flex min-h-32 items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center text-xs text-muted-foreground ${className ?? ""}`}>
        Nenhum nó neste diagrama. Adicione um nó para visualizar.
      </div>
    );
  }

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={`0 0 ${layout.width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel ?? `Diagrama: ${diagram.title}`}
      style={{ touchAction: editable ? "none" : undefined, maxWidth: "100%", height: "auto" }}
    >
      <title>{diagram.title}</title>
      <desc>{`${diagram.type} com ${layout.nodes.length} nós e ${layout.edges.length} conexões.`}</desc>
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 Z" fill={colors.muted} />
        </marker>
      </defs>
      <rect x={0} y={0} width={layout.width} height={height} fill={colors.surface} />
      <g>
        {layout.edges.map((edge) => {
          const labelPoint = edge.label ? edgeLabelPoint(edge) : null;
          const labelWidth = edge.label ? measureDiagramText(edge.label, 11) + 12 : 0;
          return (
            <g key={edge.id}>
              <path
                d={pathFor(edge)}
                fill="none"
                stroke={colors.muted}
                strokeWidth={1.6}
                strokeDasharray={edge.dashed ? "6 5" : undefined}
                markerEnd={edge.arrow ? `url(#${markerId})` : undefined}
              />
              {edge.label && labelPoint ? (
                <g>
                  <rect
                    x={labelPoint.x - labelWidth / 2}
                    y={labelPoint.y - 9}
                    width={labelWidth}
                    height={18}
                    rx={4}
                    fill={colors.surface}
                    stroke={colors.border}
                  />
                  <text x={labelPoint.x} y={labelPoint.y + 4} textAnchor="middle" fontSize={11} fill={colors.ink}>
                    {edge.label}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
      </g>
      <g>
        {layout.nodes.map((node) => {
          const offset = drag?.id === node.id ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 };
          const selected = selectedNodeId === node.id;
          return (
            <g
              key={node.id}
              transform={`translate(${number(offset.x)} ${number(offset.y)})`}
              style={{ cursor: editable ? "grab" : undefined }}
              tabIndex={editable ? 0 : undefined}
              role={editable ? "button" : undefined}
              aria-label={editable ? `Nó ${node.label}. Arraste ou use as setas para posicionar.` : undefined}
              onPointerDown={(event) => beginDrag(event, node)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(event) => nudge(event, node)}
              onClick={() => onSelectNode?.(node.id)}
            >
              <NodeShape node={node} colors={colors} />
              {selected ? (
                <rect
                  x={node.x - 3}
                  y={node.y - 3}
                  width={node.width + 6}
                  height={node.height + 6}
                  rx={6}
                  fill="none"
                  stroke={colors.accent}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              ) : null}
              <NodeText node={node} colors={colors} />
            </g>
          );
        })}
      </g>
      {captionText ? (
        <text x={layout.width / 2} y={height - 10} textAnchor="middle" fontSize={11} fill={colors.muted}>
          {captionText}
        </text>
      ) : null}
    </svg>
  );
}

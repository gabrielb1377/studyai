"use client";

import { Link2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DIAGRAM_LIMITS, createDiagramId } from "../limits";
import type { DiagramDocument, DiagramEdge, DiagramNode, DiagramNodeShape } from "../types";

const SHAPE_OPTIONS: Array<{ value: DiagramNodeShape; label: string }> = [
  { value: "box", label: "Caixa" },
  { value: "rounded", label: "Arredondado" },
  { value: "pill", label: "Pílula" },
  { value: "ellipse", label: "Elipse" },
  { value: "diamond", label: "Decisão" },
];

export type DiagramInspectorProps = {
  diagram: DiagramDocument;
  selectedNodeId?: string;
  onSelectNode: (nodeId: string) => void;
  onChange: (diagram: DiagramDocument) => void;
  disabled?: boolean;
};

/**
 * Edição estruturada de nós e conexões. Toda alteração passa pelo modelo
 * canônico — não há edição de SVG ou HTML.
 */
export function DiagramInspector({ diagram, selectedNodeId, onSelectNode, onChange, disabled = false }: DiagramInspectorProps) {
  const selectedNode = diagram.nodes.find((node) => node.id === selectedNodeId);

  const updateNode = (nodeId: string, updates: Partial<DiagramNode>) => {
    onChange({
      ...diagram,
      nodes: diagram.nodes.map((node) => (node.id === nodeId ? { ...node, ...updates } : node)),
    });
  };

  const removeNode = (nodeId: string) => {
    onChange({
      ...diagram,
      nodes: diagram.nodes.filter((node) => node.id !== nodeId),
      edges: diagram.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
    });
  };

  const addNode = () => {
    if (diagram.nodes.length >= DIAGRAM_LIMITS.maxNodes) return;
    const node: DiagramNode = {
      id: createDiagramId("n"),
      label: "Novo nó",
      shape: diagram.type === "mindmap" || diagram.type === "concept-map" ? "rounded" : "box",
    };
    onChange({ ...diagram, nodes: [...diagram.nodes, node] });
    onSelectNode(node.id);
  };

  const updateEdge = (edgeId: string, updates: Partial<DiagramEdge>) => {
    onChange({
      ...diagram,
      edges: diagram.edges.map((edge) => (edge.id === edgeId ? { ...edge, ...updates } : edge)),
    });
  };

  const removeEdge = (edgeId: string) => {
    onChange({ ...diagram, edges: diagram.edges.filter((edge) => edge.id !== edgeId) });
  };

  const addEdge = () => {
    if (diagram.nodes.length < 2 || diagram.edges.length >= DIAGRAM_LIMITS.maxEdges) return;
    const [from, to] = diagram.nodes;
    onChange({
      ...diagram,
      edges: [
        ...diagram.edges,
        { id: createDiagramId("e"), from: from.id, to: to.id, style: "solid", arrow: true },
      ],
    });
  };

  const nodeOptions = diagram.nodes.map((node) => ({ value: node.id, label: node.label.slice(0, 40) || "Sem título" }));

  return (
    <div className="space-y-4">
      <section aria-labelledby="diagram-nodes-heading" className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 id="diagram-nodes-heading" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Nós ({diagram.nodes.length}/{DIAGRAM_LIMITS.maxNodes})
          </h3>
          <Button type="button" size="xs" variant="outline" onClick={addNode} disabled={disabled || diagram.nodes.length >= DIAGRAM_LIMITS.maxNodes}>
            <Plus className="size-3 me-1" aria-hidden="true" /> Nó
          </Button>
        </div>

        <ul className="space-y-2">
          {diagram.nodes.map((node) => (
            <li key={node.id} className={`rounded-lg border p-2 ${selectedNodeId === node.id ? "border-primary bg-primary/5" : ""}`}>
              <div className="flex items-center gap-1.5">
                <Input
                  value={node.label}
                  onChange={(event) => updateNode(node.id, { label: event.target.value })}
                  onFocus={() => onSelectNode(node.id)}
                  aria-label={`Rótulo do nó ${node.label || "sem título"}`}
                  maxLength={DIAGRAM_LIMITS.maxLabelLength}
                  className="h-7 flex-1 text-xs"
                  disabled={disabled}
                />
                <Select
                  value={node.shape ?? "box"}
                  onValueChange={(value) => updateNode(node.id, { shape: value as DiagramNodeShape })}
                  options={SHAPE_OPTIONS}
                  aria-label={`Forma do nó ${node.label || "sem título"}`}
                  className="h-7 w-24 text-[11px]"
                  disabled={disabled}
                />
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => removeNode(node.id)}
                  aria-label={`Excluir nó ${node.label || "sem título"}`}
                  disabled={disabled}
                >
                  <Trash2 className="size-3 text-destructive" />
                </Button>
              </div>
              {selectedNodeId === node.id ? (
                <Textarea
                  value={node.description ?? ""}
                  onChange={(event) => updateNode(node.id, { description: event.target.value })}
                  placeholder="Descrição opcional do nó"
                  aria-label={`Descrição do nó ${node.label || "sem título"}`}
                  maxLength={DIAGRAM_LIMITS.maxDescriptionLength}
                  rows={2}
                  className="mt-2 text-[11px] leading-4"
                  disabled={disabled}
                />
              ) : null}
            </li>
          ))}
          {!diagram.nodes.length ? (
            <li className="rounded-lg border border-dashed p-3 text-center text-[11px] text-muted-foreground">
              Nenhum nó. Use “Nó” ou um template para começar.
            </li>
          ) : null}
        </ul>
      </section>

      <section aria-labelledby="diagram-edges-heading" className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 id="diagram-edges-heading" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Conexões ({diagram.edges.length}/{DIAGRAM_LIMITS.maxEdges})
          </h3>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={addEdge}
            disabled={disabled || diagram.nodes.length < 2 || diagram.edges.length >= DIAGRAM_LIMITS.maxEdges}
          >
            <Link2 className="size-3 me-1" aria-hidden="true" /> Conexão
          </Button>
        </div>

        <ul className="space-y-2">
          {diagram.edges.map((edge) => (
            <li key={edge.id} className="space-y-1.5 rounded-lg border p-2">
              <div className="flex items-center gap-1.5">
                <Select
                  value={edge.from}
                  onValueChange={(value) => updateEdge(edge.id, { from: value })}
                  options={nodeOptions}
                  aria-label="Nó de origem"
                  className="h-7 flex-1 text-[11px]"
                  disabled={disabled}
                />
                <span className="text-[11px] text-muted-foreground" aria-hidden="true">→</span>
                <Select
                  value={edge.to}
                  onValueChange={(value) => updateEdge(edge.id, { to: value })}
                  options={nodeOptions}
                  aria-label="Nó de destino"
                  className="h-7 flex-1 text-[11px]"
                  disabled={disabled}
                />
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => removeEdge(edge.id)}
                  aria-label="Excluir conexão"
                  disabled={disabled}
                >
                  <Trash2 className="size-3 text-destructive" />
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  value={edge.label ?? ""}
                  onChange={(event) => updateEdge(edge.id, { label: event.target.value })}
                  placeholder="Rótulo da conexão (opcional)"
                  aria-label="Rótulo da conexão"
                  maxLength={DIAGRAM_LIMITS.maxEdgeLabelLength}
                  className="h-7 flex-1 text-[11px]"
                  disabled={disabled}
                />
                <Select
                  value={edge.style ?? "solid"}
                  onValueChange={(value) => updateEdge(edge.id, { style: value as DiagramEdge["style"] })}
                  options={[{ value: "solid", label: "Sólida" }, { value: "dashed", label: "Tracejada" }]}
                  aria-label="Estilo da conexão"
                  className="h-7 w-24 text-[11px]"
                  disabled={disabled}
                />
              </div>
            </li>
          ))}
          {!diagram.edges.length ? (
            <li className="rounded-lg border border-dashed p-3 text-center text-[11px] text-muted-foreground">
              Nenhuma conexão. Diagramas de comparação podem ficar sem setas.
            </li>
          ) : null}
        </ul>
      </section>

      {selectedNode ? (
        <p className="rounded-lg bg-muted/40 p-2 text-[11px] leading-4 text-muted-foreground">
          Dica: arraste o nó no quadro para posicioná-lo manualmente. Use as setas do teclado para ajustes finos
          (Shift move mais). “Reorganizar” volta ao layout automático.
        </p>
      ) : null}
    </div>
  );
}

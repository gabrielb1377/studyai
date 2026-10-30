import type { DiagramDocument, DiagramTheme } from "../types";

export type DiagramCanvasReactFlowProps = {
  diagram: DiagramDocument;
  theme?: Partial<DiagramTheme>;
  className?: string;
  caption?: string;
  editable?: boolean;
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
  onMoveNode?: (nodeId: string, position: { x: number; y: number }) => void;
  onChange?: (diagram: DiagramDocument) => void;
  ariaLabel?: string;
};
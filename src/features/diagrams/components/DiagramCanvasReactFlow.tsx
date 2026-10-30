"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ReactFlow,
  useReactFlow,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
  type Viewport,
  type OnNodeDrag,
  ConnectionMode,
  addEdge,
  NodeTypes,
  EdgeTypes,
  Controls,
  Background,
  MiniMap,
  Panel,
  type NodeProps,
  type EdgeProps,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import {
  type DiagramTheme,
  type DiagramNodeShape,
  defaultDiagramTheme,
} from "../types";
import {
  diagramNodeToReactFlow,
  diagramEdgeToReactFlow,
  reactFlowToDiagramDocument,
  createDiagramNode,
} from "../adapters/reactFlowAdapter";
import { type DiagramCanvasReactFlowProps } from "./DiagramCanvasReactFlow.types";
import "@xyflow/react/dist/style.css";
import { Plus, Minus, RotateCcw, Target, Grip } from "lucide-react";
import { Button } from "@/components/ui/button";

const SNAP_GRID_SIZE = 16;

// Custom node component with shape support
function CustomNode({ data, selected: _selected, id: _id }: NodeProps) {
  const { label, description, shape } = data as {
    label: string;
    description: string;
    shape: DiagramNodeShape;
  };

  const getShapeStyle = (shape: DiagramNodeShape) => {
    switch (shape) {
      case "ellipse":
        return { borderRadius: "50%" };
      case "diamond":
        return { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" };
      case "pill":
        return { borderRadius: "9999px" };
      case "rounded":
        return { borderRadius: "12px" };
      default:
        return { borderRadius: "5px" };
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "12px 16px",
        boxSizing: "border-box",
        ...getShapeStyle(shape),
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>
        {label}
      </span>
      {description && (
        <span style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
          {description}
        </span>
      )}
    </div>
  );
}

// Custom edge component with curve support
function CustomEdge({ id, label, style, markerEnd }: EdgeProps) {
  return (
    <>
      <path
        id={`${id}-path`}
        style={{
          stroke: "#5b6b85",
          strokeWidth: 1.6,
          fill: "none",
          ...style,
        }}
        markerEnd={markerEnd ? "url(#arrowclosed)" : undefined}
      />
      {label && (
        <g>
          <text style={{ fontSize: 11, fontWeight: 500 }}>
            <textPath href={`#${id}-path`} startOffset="50%" textAnchor="middle">
              {label}
            </textPath>
          </text>
        </g>
      )}
      <defs>
        <marker
          id="arrowclosed"
          markerWidth={10}
          markerHeight={10}
          refX={9}
          refY={3}
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill="#5b6b85" />
        </marker>
      </defs>
    </>
  );
}

const nodeTypes: NodeTypes = {
  default: CustomNode,
  diamond: CustomNode,
};

const edgeTypes: EdgeTypes = {
  default: CustomEdge,
  step: CustomEdge,
  bezier: CustomEdge,
};

export function DiagramCanvasReactFlow({
  diagram,
  theme,
  className,
  caption,
  editable = false,
  selectedNodeId: _selectedNodeId,
  onSelectNode,
  onMoveNode,
  onChange,
  ariaLabel: _ariaLabel,
}: DiagramCanvasReactFlowProps) {
  const colors = useMemo<DiagramTheme>(
    () => ({ ...defaultDiagramTheme, ...(theme ?? {}) }),
    [theme]
  );

  const captionText = caption ?? diagram.caption ?? "";

  // Convert DiagramDocument to React Flow nodes/edges
  const initialNodes = useMemo(() =>
    diagram.nodes.map(node => diagramNodeToReactFlow(node, colors)),
    [diagram.nodes, colors]
  );

  const initialEdges = useMemo(() =>
    diagram.edges.map(edge => diagramEdgeToReactFlow(edge)),
    [diagram.edges]
  );

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const { getViewport, setViewport: setViewportInstance, fitView: fitViewInstance, zoomIn: zoomInInstance, zoomOut: zoomOutInstance, setNodes: setNodesInstance, setEdges: setEdgesInstance, getNodes, getEdges } = useReactFlow();
  const isInternalChange = useRef(false);
  const isProgrammaticChange = useRef(false);

  // Sync initial nodes/edges when diagram changes
  useEffect(() => {
    if (isProgrammaticChange.current) return;
    const newNodes = diagram.nodes.map(node => diagramNodeToReactFlow(node, colors));
    const newEdges = diagram.edges.map(edge => diagramEdgeToReactFlow(edge));
    setNodes(newNodes);
    setEdges(newEdges);
    // Reset history on diagram change
    setHistory([{ nodes: newNodes, edges: newEdges }]);
    setHistoryIndex(0);
  }, [diagram, colors]);

  // Save to history when nodes/edges change
  const saveToHistory = useCallback((newNodes: Node[], newEdges: Edge[]) => {
    if (isInternalChange.current) return;
    const newState = { nodes: newNodes, edges: newEdges };
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newState);
      return newHistory.slice(-50); // Limit history to 50 states
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  // Handle node changes (position, selection, etc.)
  const onNodesChange: OnNodesChange = useCallback((changes) => {
    setNodes((prev) => {
      const newNodes = applyNodeChanges(changes, prev);
      // Check for position changes to save to history
      changes.forEach(change => {
        if (change.type === "position" && change.dragging === false) {
          setTimeout(() => saveToHistory(newNodes, edges), 0);
        }
        if (change.type === "select") {
          onSelectNode?.(change.id);
        }
      });
      return newNodes;
    });
  }, [edges, onSelectNode, saveToHistory]);

  // Handle edge changes
  const onEdgesChange: OnEdgesChange = useCallback((changes) => {
    setEdges((prev) => applyEdgeChanges(changes, prev));
  }, []);

  // Handle new connections
  const onConnect: OnConnect = useCallback((connection: Connection) => {
    setEdges((prev) => {
      const newEdges = addEdge(connection, prev);
      saveToHistory(nodes, newEdges);
      return newEdges;
    });
  }, [nodes, saveToHistory]);

  // Handle node drag end
  const onNodeDragStop: OnNodeDrag<Node> = useCallback((_event: MouseEvent | TouchEvent, node: Node, _nodes: Node[]) => {
    if (!editable || !onMoveNode) return;
    // Snap to grid
    const snappedX = Math.round(node.position.x / SNAP_GRID_SIZE) * SNAP_GRID_SIZE;
    const snappedY = Math.round(node.position.y / SNAP_GRID_SIZE) * SNAP_GRID_SIZE;

    setNodes((prev) =>
      prev.map((n) =>
        n.id === node.id ? { ...n, position: { x: snappedX, y: snappedY } } : n
      )
    );

    onMoveNode(node.id, { x: snappedX, y: snappedY });
    saveToHistory(nodes, edges);
  }, [editable, onMoveNode, nodes, edges, saveToHistory]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!editable) return;

      const instance = {
      getNodes,
      getEdges,
      setNodes: setNodesInstance,
      setEdges: setEdgesInstance,
      fitView: fitViewInstance,
      zoomIn: zoomInInstance,
      zoomOut: zoomOutInstance,
      getViewport,
    };
      if (!instance) return;

      // Delete selected nodes
      if (event.key === "Delete" || event.key === "Backspace") {
        const selectedNodes = instance.getNodes().filter(n => n.selected);
        const selectedEdges = instance.getEdges().filter(e => e.selected);
        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
          event.preventDefault();
          setNodes((prev) => prev.filter(n => !n.selected));
          setEdges((prev) => prev.filter(e => !e.selected));
          saveToHistory(
            instance.getNodes().filter(n => !n.selected),
            instance.getEdges().filter(e => !e.selected)
          );
        }
      }

      // Duplicate (Ctrl/Cmd + D)
      if ((event.ctrlKey || event.metaKey) && event.key === "d") {
        event.preventDefault();
        const selectedNodes = instance.getNodes().filter(n => n.selected);
        if (selectedNodes.length > 0) {
          const _newNodes = selectedNodes.map(n => ({
            ...createDiagramNode(n.data.shape as DiagramNodeShape, n.data.label as string, {
              x: n.position.x + 20,
              y: n.position.y + 20,
            }),
            position: { x: n.position.x + 20, y: n.position.y + 20 },
          }));
          // This would need proper integration with the adapter
        }
      }

      // Select all (Ctrl/Cmd + A)
      if ((event.ctrlKey || event.metaKey) && event.key === "a") {
        event.preventDefault();
        instance.setNodes(nodes => nodes.map(node => ({ ...node, selected: true })));
      }

      // Escape - deselect all
      if (event.key === "Escape") {
        instance.setNodes(nodes => nodes.map(node => ({ ...node, selected: false })));
        instance.setEdges(edges => edges.map(edge => ({ ...edge, selected: false })));
        onSelectNode?.("");
      }

      // Undo (Ctrl/Cmd + Z)
      if ((event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        if (historyIndex > 0) {
          isInternalChange.current = true;
          const prevState = history[historyIndex - 1];
          setNodes(prevState.nodes);
          setEdges(prevState.edges);
          setHistoryIndex(prev => prev - 1);
          isInternalChange.current = false;
          const newDiagram = reactFlowToDiagramDocument(diagram, prevState.nodes, prevState.edges);
          onChange?.(newDiagram);
        }
      }

      // Redo (Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y)
      if (
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "z") ||
        ((event.ctrlKey || event.metaKey) && event.key === "y")
      ) {
        event.preventDefault();
        if (historyIndex < history.length - 1) {
          isInternalChange.current = true;
          const nextState = history[historyIndex + 1];
          setNodes(nextState.nodes);
          setEdges(nextState.edges);
          setHistoryIndex(prev => prev + 1);
          isInternalChange.current = false;
          const newDiagram = reactFlowToDiagramDocument(diagram, nextState.nodes, nextState.edges);
          onChange?.(newDiagram);
        }
      }

      // Fit view (F)
      if (event.key === "f") {
        event.preventDefault();
        instance.fitView({ padding: 0.1 });
      }

      // Zoom in/out (+ / -)
      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        instance.zoomIn();
      }
      if (event.key === "-") {
        event.preventDefault();
        instance.zoomOut();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editable, history, historyIndex, nodes, edges, onSelectNode, onChange, diagram, saveToHistory, getNodes, getEdges, setNodesInstance, setEdgesInstance, fitViewInstance, zoomInInstance, zoomOutInstance, getViewport]);

  // Toolbar actions
  const fitView = useCallback(() => {
    fitViewInstance({ padding: 0.1 });
  }, [fitViewInstance]);

  const zoomIn = useCallback(() => {
    zoomInInstance();
  }, [zoomInInstance]);

  const zoomOut = useCallback(() => {
    zoomOutInstance();
  }, [zoomOutInstance]);

  const resetZoom = useCallback(() => {
    setViewportInstance({ x: 0, y: 0, zoom: 1 }, { duration: 300 });
  }, [setViewportInstance]);

  const snapToGrid = useCallback(() => {
    if (!editable) return;
    setNodes(prev => {
      const newNodes = prev.map(node => ({
        ...node,
        position: {
          x: Math.round(node.position.x / SNAP_GRID_SIZE) * SNAP_GRID_SIZE,
          y: Math.round(node.position.y / SNAP_GRID_SIZE) * SNAP_GRID_SIZE,
        },
      }));
      saveToHistory(newNodes, edges);
      return newNodes;
    });
  }, [editable, edges, saveToHistory]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      isInternalChange.current = true;
      const prevState = history[historyIndex - 1];
      setNodes(prevState.nodes);
      setEdges(prevState.edges);
      setHistoryIndex(prev => prev - 1);
      isInternalChange.current = false;
      const newDiagram = reactFlowToDiagramDocument(diagram, prevState.nodes, prevState.edges);
      onChange?.(newDiagram);
    }
  }, [history, historyIndex, diagram, onChange]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isInternalChange.current = true;
      const nextState = history[historyIndex + 1];
      setNodes(nextState.nodes);
      setEdges(nextState.edges);
      setHistoryIndex(prev => prev + 1);
      isInternalChange.current = false;
      const newDiagram = reactFlowToDiagramDocument(diagram, nextState.nodes, nextState.edges);
      onChange?.(newDiagram);
    }
  }, [history, historyIndex, diagram, onChange]);

  const handleAlignLeft = useCallback(() => {
    const selected = nodes.filter(n => n.selected);
    if (selected.length < 2) return;
    const minX = Math.min(...selected.map(n => n.position.x));
    setNodes(prev => prev.map(node => {
      if (selected.some(s => s.id === node.id)) {
        return { ...node, position: { ...node.position, x: minX } };
      }
      return node;
    }));
    saveToHistory(nodes, edges);
  }, [nodes, edges, saveToHistory]);

  const handleAlignCenter = useCallback(() => {
    const selected = nodes.filter(n => n.selected);
    if (selected.length < 2) return;
    const centerX = selected.reduce((sum, n) => sum + n.position.x + (n.width || 160) / 2, 0) / selected.length;
    setNodes(prev => prev.map(node => {
      if (selected.some(s => s.id === node.id)) {
        return { ...node, position: { ...node.position, x: centerX - (node.width || 160) / 2 } };
      }
      return node;
    }));
    saveToHistory(nodes, edges);
  }, [nodes, edges, saveToHistory]);

  const handleAlignRight = useCallback(() => {
    const selected = nodes.filter(n => n.selected);
    if (selected.length < 2) return;
    const maxX = Math.max(...selected.map(n => n.position.x + (n.width || 160)));
    setNodes(prev => prev.map(node => {
      if (selected.some(s => s.id === node.id)) {
        return { ...node, position: { ...node.position, x: maxX - (node.width || 160) } };
      }
      return node;
    }));
    saveToHistory(nodes, edges);
  }, [nodes, edges, saveToHistory]);

  const handleAlignTop = useCallback(() => {
    const selected = nodes.filter(n => n.selected);
    if (selected.length < 2) return;
    const minY = Math.min(...selected.map(n => n.position.y));
    setNodes(prev => prev.map(node => {
      if (selected.some(s => s.id === node.id)) {
        return { ...node, position: { ...node.position, y: minY } };
      }
      return node;
    }));
    saveToHistory(nodes, edges);
  }, [nodes, edges, saveToHistory]);

  const handleAlignMiddle = useCallback(() => {
    const selected = nodes.filter(n => n.selected);
    if (selected.length < 2) return;
    const centerY = selected.reduce((sum, n) => sum + n.position.y + (n.height || 48) / 2, 0) / selected.length;
    setNodes(prev => prev.map(node => {
      if (selected.some(s => s.id === node.id)) {
        return { ...node, position: { ...node.position, y: centerY - (node.height || 48) / 2 } };
      }
      return node;
    }));
    saveToHistory(nodes, edges);
  }, [nodes, edges, saveToHistory]);

  const handleAlignBottom = useCallback(() => {
    const selected = nodes.filter(n => n.selected);
    if (selected.length < 2) return;
    const maxY = Math.max(...selected.map(n => n.position.y + (n.height || 48)));
    setNodes(prev => prev.map(node => {
      if (selected.some(s => s.id === node.id)) {
        return { ...node, position: { ...node.position, y: maxY - (node.height || 48) } };
      }
      return node;
    }));
    saveToHistory(nodes, edges);
  }, [nodes, edges, saveToHistory]);

  const handleDistributeHorizontal = useCallback(() => {
    const selected = nodes.filter(n => n.selected).sort((a, b) => a.position.x - b.position.x);
    if (selected.length < 3) return;
    const leftmost = selected[0].position.x;
    const rightmost = selected[selected.length - 1].position.x + (selected[selected.length - 1].width || 160);
    const spacing = (rightmost - leftmost - selected.reduce((sum, n) => sum + (n.width || 160), 0)) / (selected.length - 1);
    let currentX = leftmost;
    setNodes(prev => prev.map(node => {
      const sel = selected.find(s => s.id === node.id);
      if (sel) {
        const newNode = { ...node, position: { ...node.position, x: currentX } };
        currentX += (node.width || 160) + spacing;
        return newNode;
      }
      return node;
    }));
    saveToHistory(nodes, edges);
  }, [nodes, edges, saveToHistory]);

  const handleDistributeVertical = useCallback(() => {
    const selected = nodes.filter(n => n.selected).sort((a, b) => a.position.y - b.position.y);
    if (selected.length < 3) return;
    const topmost = selected[0].position.y;
    const bottommost = selected[selected.length - 1].position.y + (selected[selected.length - 1].height || 48);
    const spacing = (bottommost - topmost - selected.reduce((sum, n) => sum + (n.height || 48), 0)) / (selected.length - 1);
    let currentY = topmost;
    setNodes(prev => prev.map(node => {
      const sel = selected.find(s => s.id === node.id);
      if (sel) {
        const newNode = { ...node, position: { ...node.position, y: currentY } };
        currentY += (node.height || 48) + spacing;
        return newNode;
      }
      return node;
    }));
    saveToHistory(nodes, edges);
  }, [nodes, edges, saveToHistory]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Touch gesture handling for mobile
  const touchState = useRef<{
    initialDistance: number;
    initialViewport: Viewport | null;
    initialCenter: { x: number; y: number } | null;
  }>({ initialDistance: 0, initialViewport: null, initialCenter: null });

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    if (event.touches.length === 2) {
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const dx = touch2.clientX - touch1.clientX;
      const dy = touch2.clientY - touch1.clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;

      touchState.current = {
        initialDistance: distance,
        initialViewport: getViewport() ?? { x: 0, y: 0, zoom: 1 },
        initialCenter: { x: centerX, y: centerY },
      };
    }
  }, [getViewport]);

  const onTouchMove = useCallback((event: React.TouchEvent) => {
    if (event.touches.length === 2 && touchState.current.initialViewport) {
      event.preventDefault();
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const dx = touch2.clientX - touch1.clientX;
      const dy = touch2.clientY - touch1.clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;

      const scale = distance / touchState.current.initialDistance;
      const viewport = touchState.current.initialViewport;

      if (viewport) {
        const newZoom = Math.min(Math.max(viewport.zoom * scale, 0.1), 4);
        const deltaX = centerX - (touchState.current.initialCenter?.x ?? centerX);
        const deltaY = centerY - (touchState.current.initialCenter?.y ?? centerY);

        setViewportInstance({
          x: viewport.x - deltaX,
          y: viewport.y - deltaY,
          zoom: newZoom,
        });
      }
    }
  }, [setViewportInstance]);

  const onTouchEnd = useCallback(() => {
    touchState.current = { initialDistance: 0, initialViewport: null, initialCenter: null };
  }, []);

  return (
    <div
      className={`relative ${className ?? ""}`}
      style={{ width: "100%", height: "100%", minHeight: "400px", touchAction: "none" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onViewportChange={setViewportInstance}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView={false}
        snapToGrid={editable}
        snapGrid={[SNAP_GRID_SIZE, SNAP_GRID_SIZE]}
        connectionMode={editable ? ConnectionMode.Loose : undefined}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.1}
        maxZoom={4}
        panActivationKeyCode={editable ? "Shift" : undefined}
        panOnDrag={!editable}
        panOnScroll={!editable}
        panOnScrollSpeed={0.5}
        zoomOnScroll={editable}
        zoomOnPinch={editable}
        selectNodesOnDrag={editable}
        nodesDraggable={editable}
        nodesConnectable={editable}
        elementsSelectable={editable}
        attributionPosition="bottom-left"
      >
        <Background
          color={colors.muted}
          gap={SNAP_GRID_SIZE}
          size={SNAP_GRID_SIZE}
          style={{ opacity: editable ? 0.4 : 0 }}
        />
        <Controls
          showZoom={editable}
          showFitView={editable}
          showInteractive={editable}
        />
        <MiniMap
          nodeColor={(node) => (node.selected ? colors.accent : colors.muted)}
          maskColor="rgba(255, 255, 255, 0.8)"
        />
      </ReactFlow>

      {/* Floating Toolbar */}
      {editable && (
        <Panel position="top-right" style={{ zIndex: 100 }}>
          <div className="flex flex-col gap-1 p-2 bg-white/90 backdrop-blur rounded-xl border shadow-lg">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 p-1 border-b">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={zoomIn}
                title="Zoom In (+)"
                aria-label="Zoom In"
              >
                <Plus className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={zoomOut}
                title="Zoom Out (-)"
                aria-label="Zoom Out"
              >
                <Minus className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={resetZoom}
                title="Reset Zoom"
                aria-label="Reset Zoom"
              >
                <RotateCcw className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={fitView}
                title="Fit View (F)"
                aria-label="Fit View"
              >
                <Target className="size-3.5" />
              </Button>
            </div>

            {/* Grid Snap */}
            <div className="flex items-center gap-1 p-1 border-b">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={snapToGrid}
                title="Snap to Grid (16px)"
                aria-label="Snap to Grid"
              >
                <Grip className="size-3.5" />
              </Button>
            </div>

            {/* Undo/Redo */}
            <div className="flex items-center gap-1 p-1 border-b">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <RotateCcw className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleRedo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
              >
                <RotateCcw className="size-3.5" style={{ transform: "rotate(180deg)" }} />
              </Button>
            </div>

            {/* Alignment Tools */}
            <div className="flex items-center gap-1 p-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleAlignLeft}
                title="Align Left"
                aria-label="Align Left"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="6" height="18" rx="1" />
                  <rect x="15" y="8" width="6" height="8" rx="1" />
                </svg>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleAlignCenter}
                title="Align Center"
                aria-label="Align Center"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="6" height="18" rx="1" />
                  <rect x="15" y="8" width="6" height="8" rx="1" />
                </svg>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleAlignRight}
                title="Align Right"
                aria-label="Align Right"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="6" height="18" rx="1" />
                  <rect x="15" y="8" width="6" height="8" rx="1" />
                </svg>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleAlignTop}
                title="Align Top"
                aria-label="Align Top"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="6" rx="1" />
                  <rect x="8" y="15" width="8" height="6" rx="1" />
                </svg>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleAlignMiddle}
                title="Align Middle"
                aria-label="Align Middle"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="6" rx="1" />
                  <rect x="8" y="15" width="8" height="6" rx="1" />
                </svg>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleAlignBottom}
                title="Align Bottom"
                aria-label="Align Bottom"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="6" rx="1" />
                  <rect x="8" y="15" width="8" height="6" rx="1" />
                </svg>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleDistributeHorizontal}
                title="Distribute Horizontally"
                aria-label="Distribute Horizontally"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="8" width="4" height="8" rx="1" />
                  <rect x="10" y="8" width="4" height="8" rx="1" />
                  <rect x="17" y="8" width="4" height="8" rx="1" />
                  <line x1="7" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
                  <line x1="14" y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
                </svg>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleDistributeVertical}
                title="Distribute Vertically"
                aria-label="Distribute Vertically"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="8" y="3" width="8" height="4" rx="1" />
                  <rect x="8" y="10" width="8" height="4" rx="1" />
                  <rect x="8" y="17" width="8" height="4" rx="1" />
                  <line x1="12" y1="7" x2="12" y2="10" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
                  <line x1="12" y1="14" x2="12" y2="17" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
                </svg>
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {captionText && (
        <div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center text-xs text-muted-foreground px-2 py-1 bg-background/80 backdrop-blur rounded"
          style={{ pointerEvents: "none" }}
        >
          {captionText}
        </div>
      )}
    </div>
  );
}
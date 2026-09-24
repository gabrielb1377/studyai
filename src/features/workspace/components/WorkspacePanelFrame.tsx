"use client";

import { memo, useEffect, useRef } from "react";
import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkspacePanel } from "../types";

export const WorkspacePanelFrame = memo(function WorkspacePanelFrame({ panel, children, onActivate, onMinimize, onMaximize, onClose, onScrollChange }: {
  panel: WorkspacePanel;
  children: React.ReactNode;
  onActivate: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
  onScrollChange: (scrollTop: number) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (bodyRef.current && panel.scrollTop > 0) bodyRef.current.scrollTop = panel.scrollTop;
  }, [panel.id, panel.scrollTop]);
  return (
    <section role="tabpanel" aria-label={panel.title} className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border bg-background/85 shadow-[var(--shadow-card)] transition-[height,box-shadow,border-color] duration-200 focus-within:border-primary/25 ${panel.maximized ? "h-[calc(100dvh-11rem)]" : "h-[calc(100dvh-14rem)] min-h-[34rem] max-h-[58rem]"}`} onPointerDown={onActivate}>
      <header className="flex h-11 shrink-0 items-center gap-1.5 border-b bg-muted/28 px-3 backdrop-blur-sm">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{panel.title}</span>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`${panel.minimized ? "Restaurar" : "Minimizar"} ${panel.title}`} onClick={onMinimize}><Minus /></Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`${panel.maximized ? "Restaurar" : "Maximizar"} ${panel.title}`} onClick={onMaximize}>{panel.maximized ? <Minimize2 /> : <Maximize2 />}</Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Fechar ${panel.title}`} onClick={onClose}><X /></Button>
      </header>
      {!panel.minimized && <div ref={bodyRef} className="premium-scroll min-h-0 flex-1 overflow-auto p-3 sm:p-4" onScroll={(event) => { window.clearTimeout(scrollTimer.current); const scrollTop = event.currentTarget.scrollTop; scrollTimer.current = window.setTimeout(() => onScrollChange(scrollTop), 180); }}>{children}</div>}
    </section>
  );
});

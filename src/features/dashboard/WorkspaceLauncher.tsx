"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutGrid, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WorkspaceStorage } from "@/features/workspace/services/WorkspaceStorage";
import type { StudyRecord } from "@/types/study-engine";

export function WorkspaceLauncher({ studies }: { studies: readonly StudyRecord[] }) {
  const latest = [...studies].sort((left, right) => right.lastAccessedAt.localeCompare(left.lastAccessedAt))[0];
  const [studyId, setStudyId] = useState(latest?.studyId ?? "");
  const [layoutId, setLayoutId] = useState("reading");
  const [layouts, setLayouts] = useState(WorkspaceStorage.loadLayouts());
  useEffect(() => {
    setLayouts(WorkspaceStorage.loadLayouts());
    const current = localStorage.getItem("studyai:workspace-current");
    if (current && studies.some((study) => study.studyId === current)) setStudyId(current);
    else if (latest) setStudyId(latest.studyId);
  }, [latest, studies]);
  if (!latest) return null;
  return <Card className="gap-4 p-5 shadow-none"><div className="flex flex-wrap items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><LayoutGrid className="size-5" /></span><div className="min-w-0 flex-1"><h2 className="font-semibold">Workspace</h2><p className="text-sm text-muted-foreground">Retome o último ambiente ou comece com outro layout.</p></div><Button asChild><Link href={`/estudo?tema=${encodeURIComponent(studyId)}`}><RotateCcw />Abrir último Workspace</Link></Button></div><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><select aria-label="Tema do Workspace" value={studyId} onChange={(event) => setStudyId(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">{studies.map((study) => <option key={study.studyId} value={study.studyId}>{study.subject} · {study.title}</option>)}</select><select aria-label="Layout inicial" value={layoutId} onChange={(event) => setLayoutId(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">{layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.name}</option>)}</select><Button asChild variant="outline"><Link href={`/estudo?tema=${encodeURIComponent(studyId)}&layout=${encodeURIComponent(layoutId)}&novo=1`}><Plus />Novo Workspace</Link></Button></div></Card>;
}

"use client";

import Link from "next/link";
import { ChevronRight, FileText, FolderOpen } from "lucide-react";
import type { Material } from "@/types/material";
import type { StudyRecord } from "@/types/study-engine";

export function StudyNavigationSidebar({
  studies,
  materials,
  activeStudyId,
  activeMaterialId,
}: {
  studies: readonly StudyRecord[];
  materials: readonly Material[];
  activeStudyId: string;
  activeMaterialId?: string;
}) {
  const subjects = Array.from(new Set(studies.map((study) => study.subject))).sort();
  return (
    <aside aria-label="Navegação dos estudos" className="rounded-xl border bg-card p-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <p className="px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Matérias e temas</p>
      <ul className="space-y-3">
        {subjects.map((subject) => (
          <li key={subject}>
            <p className="flex items-center gap-2 px-2 py-1 text-sm font-semibold"><FolderOpen className="size-4 text-primary" />{subject}</p>
            <ul className="mt-1 space-y-1 border-l pl-3">
              {studies.filter((study) => study.subject === subject).map((study) => (
                <li key={study.studyId}>
                  <Link href={`/estudo?tema=${study.studyId}`} aria-current={study.studyId === activeStudyId ? "page" : undefined} className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors ${study.studyId === activeStudyId ? "bg-accent font-medium" : "hover:bg-accent/60"}`}>
                    <ChevronRight className="size-3.5" />{study.title}
                  </Link>
                  {study.studyId === activeStudyId && (
                    <ul className="ml-4 space-y-1 border-l pl-2">
                      {materials.filter((material) => material.studyId === study.studyId).map((material) => (
                        <li key={material.id}>
                          <Link href={`/estudo?tema=${study.studyId}&arquivo=${material.id}&aba=material`} aria-current={material.id === activeMaterialId ? "page" : undefined} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${material.id === activeMaterialId ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}>
                            <FileText className="size-3.5 shrink-0" /><span className="truncate">{material.name}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </aside>
  );
}

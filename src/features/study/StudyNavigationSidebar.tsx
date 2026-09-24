"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, FolderOpen } from "lucide-react";
import type { Material } from "@/types/material";
import type { StudyRecord } from "@/types/study-engine";

const courseOf = (study: StudyRecord) => study.course || "Curso não informado";
const semesterOf = (study: StudyRecord) => study.semester || "Semestre não informado";

export function StudyNavigationSidebar({ studies, materials, activeStudyId, activeMaterialId }: {
  studies: readonly StudyRecord[];
  materials: readonly Material[];
  activeStudyId: string;
  activeMaterialId?: string;
}) {
  const courses = Array.from(new Set(studies.map(courseOf))).sort();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <aside aria-label="Navegação dos estudos" className="rounded-2xl border bg-card/88 p-3 shadow-[var(--shadow-card)] lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <button type="button" aria-expanded={mobileOpen} onClick={() => setMobileOpen((current) => !current)} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-sm font-semibold lg:hidden"><FolderOpen className="size-4 text-primary" />Navegar por matérias e temas<ChevronDown className={`ml-auto size-4 transition-transform ${mobileOpen ? "rotate-180" : ""}`} /></button>
      <p className="px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Curso, semestre e materiais</p>
      <ul className={`${mobileOpen ? "block" : "hidden"} space-y-3 lg:block`}>
        {courses.map((course) => {
          const courseStudies = studies.filter((study) => courseOf(study) === course);
          const semesters = Array.from(new Set(courseStudies.map(semesterOf))).sort();
          return <li key={course}>
            <p className="flex items-center gap-2 px-2 py-1 text-sm font-semibold"><FolderOpen className="size-4 text-primary" />{course}</p>
            <ul className="ml-2 mt-1 space-y-3 border-l pl-3">
              {semesters.map((semester) => {
                const semesterStudies = courseStudies.filter((study) => semesterOf(study) === semester);
                const subjects = Array.from(new Set(semesterStudies.map((study) => study.subject))).sort();
                return <li key={semester}>
                  <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">{semester}</p>
                  <ul className="space-y-3">{subjects.map((subject) => <li key={subject}>
                    <p className="px-2 py-1 text-xs font-semibold">{subject}</p>
                    <ul className="mt-1 space-y-1 border-l pl-2">
                      {semesterStudies.filter((study) => study.subject === subject).map((study) => <li key={study.studyId}>
                        <Link href={`/estudo?tema=${study.studyId}`} aria-current={study.studyId === activeStudyId ? "page" : undefined} className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors ${study.studyId === activeStudyId ? "bg-accent font-medium" : "hover:bg-accent/60"}`}>
                          <ChevronRight className="size-3.5" />{study.title}
                        </Link>
                        {study.studyId === activeStudyId && <ul className="ml-4 space-y-1 border-l pl-2">
                          {materials.filter((material) => material.studyId === study.studyId).map((material) => <li key={material.id}>
                            <Link href={`/estudo?tema=${study.studyId}&arquivo=${material.id}&aba=material`} aria-current={material.id === activeMaterialId ? "page" : undefined} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${material.id === activeMaterialId ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}>
                              <FileText className="size-3.5 shrink-0" /><span className="truncate">{material.name}</span>
                            </Link>
                          </li>)}
                        </ul>}
                      </li>)}
                    </ul>
                  </li>)}</ul>
                </li>;
              })}
            </ul>
          </li>;
        })}
      </ul>
    </aside>
  );
}

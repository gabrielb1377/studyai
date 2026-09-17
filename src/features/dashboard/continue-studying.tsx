"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StudyRecord } from "@/types/study-engine";
import type { Material } from "@/types/material";
import { WorkspacePersistence, type StudyWorkspaceState } from "@/features/study/services/WorkspacePersistence";
import { useEffect, useState } from "react";

export function ContinueStudying({ records, materials }: { records: readonly StudyRecord[]; materials: readonly Material[] }) {
  const record = [...records].sort((a, b) => b.lastAccessedAt.localeCompare(a.lastAccessedAt))[0];
  const [workspace, setWorkspace] = useState<StudyWorkspaceState | null>(null);
  useEffect(() => {
    if (record) setWorkspace(WorkspacePersistence.load(record.studyId));
  }, [record]);
  const lastMaterial = materials.find((material) => material.id === workspace?.materialId && material.studyId === record?.studyId)
    ?? materials.find((material) => material.studyId === record?.studyId);
  const pdfState = lastMaterial ? workspace?.pdf[lastMaterial.id] : undefined;
  const chapter = record?.chapters?.[pdfState?.chapterIndex ?? 0];
  const remainingMinutes = record ? Math.max(0, Math.ceil((record.readingTimeMinutes ?? 0) * (100 - record.progress) / 100)) : 0;
  return (
    <section
      className="relative flex min-h-72 flex-col overflow-hidden rounded-xl border border-primary/15 bg-secondary/60 p-6 sm:p-8"
      aria-labelledby="continue-title"
    >
      <div className="relative z-10 max-w-md">
        <p className="mb-6 flex items-center gap-2 text-xs font-medium text-primary">
          <span className="size-1.5 rounded-full bg-primary" />
          CONTINUE DE ONDE PAROU
        </p>
        {record ? (
          <>
        <p className="mb-2 text-xs text-muted-foreground">
          {record.subject}{record.semester ? <><span className="mx-1">/</span>{record.semester}</> : null}
        </p>
        <h2
          id="continue-title"
          className="text-2xl font-semibold tracking-tight sm:text-[28px]"
        >
          {record.title}
        </h2>
        <p className="mt-3 max-w-80 text-sm leading-6 text-muted-foreground">
          Retome o estudo com seus materiais, anotações e atividades vinculadas.
        </p>
        <dl className="mt-4 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <div><dt className="inline font-medium text-foreground">Último arquivo: </dt><dd className="inline">{lastMaterial?.name ?? "—"}</dd></div>
          <div><dt className="inline font-medium text-foreground">Última página: </dt><dd className="inline">{pdfState?.page ?? "—"}</dd></div>
          <div><dt className="inline font-medium text-foreground">Capítulo: </dt><dd className="inline">{chapter?.title ?? "—"}</dd></div>
          <div><dt className="inline font-medium text-foreground">Tempo restante: </dt><dd className="inline">{remainingMinutes} min</dd></div>
          <div className="sm:col-span-2"><dt className="inline font-medium text-foreground">Último acesso: </dt><dd className="inline">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(record.lastAccessedAt))}</dd></div>
        </dl>
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <Button asChild className="h-11 px-5">
            <Link href={`/estudo?tema=${record.studyId}`}>
              Continuar estudando
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <span className="text-xs text-muted-foreground">
            {record.progress}% concluído
          </span>
        </div>
          </>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">Nenhum estudo organizado</p>
            <h2 id="continue-title" className="text-2xl font-semibold tracking-tight sm:text-[28px]">
              Seu próximo tema começa aqui
            </h2>
            <p className="mt-3 max-w-80 text-sm leading-6 text-muted-foreground">
              Importe um material para criar automaticamente o primeiro estudo.
            </p>
            <Button asChild className="mt-7 h-11 px-5">
              <Link href="/importar">Importar material<ArrowRight className="size-4" /></Link>
            </Button>
          </>
        )}
      </div>
      <div
        className="pointer-events-none absolute -right-6 top-10 hidden size-52 items-center justify-center rounded-full border border-primary/10 xl:flex"
        aria-hidden="true"
      >
        <div className="flex size-40 items-center justify-center rounded-full border border-primary/10">
          <div className="flex size-28 -rotate-12 items-center justify-center rounded-2xl border border-primary/15 bg-card/60 text-primary/60 shadow-sm">
            <BookOpen className="size-14" strokeWidth={1} />
          </div>
        </div>
        <div className="absolute bottom-2 left-3 rounded-xl border bg-card p-3 text-primary/70">
          <Layers className="size-5" strokeWidth={1.5} />
        </div>
      </div>
    </section>
  );
}

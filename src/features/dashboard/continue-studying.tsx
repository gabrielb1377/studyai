"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
      className="surface-raised relative flex min-h-72 flex-col overflow-hidden rounded-2xl border border-primary/15 bg-secondary/55 p-6 sm:p-8"
      aria-labelledby="continue-title"
    >
      <div className="relative z-10 max-w-md">
        <p className="type-eyebrow mb-6 flex items-center gap-2 text-primary">
          <span className="size-1.5 rounded-full bg-primary" />
          Continue de onde parou
        </p>
        {record ? (
          <>
        <p className="mb-2 text-xs text-muted-foreground">
          {record.subject}{record.semester ? <><span className="mx-1">/</span>{record.semester}</> : null}
        </p>
        <h2
          id="continue-title"
          className="text-2xl font-semibold tracking-tight sm:text-3xl"
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
          <Button asChild size="lg">
            <a href={`/estudo?tema=${encodeURIComponent(record.studyId)}`}>
              Continuar estudando
              <ArrowRight className="size-4" />
            </a>
          </Button>
          <span className="text-xs text-muted-foreground">
            {record.progress}% concluído
          </span>
        </div>
          </>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">Nenhum estudo organizado</p>
            <h2 id="continue-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Seu próximo tema começa aqui
            </h2>
            <p className="mt-3 max-w-80 text-sm leading-6 text-muted-foreground">
              Importe um material para criar automaticamente o primeiro estudo.
            </p>
            <Button asChild size="lg" className="mt-7">
              <Link href="/importar">Importar material<ArrowRight className="size-4" /></Link>
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

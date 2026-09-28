"use client";

import { PageHeading } from "@/components/page-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { AcademyCreateDialog } from "./AcademyCreateDialog";
import { AcademyEmptyState } from "./AcademyEmptyState";
import { AcademyStudyCard } from "./AcademyStudyCard";
import { useAcademyStudies } from "../hooks/useAcademyStudies";

export function AcademyPage() {
  const { studies, isLoading, isCreating, error, create } = useAcademyStudies();

  return (
    <>
      <PageHeading eyebrow="Estudo sem material" title="Academy" description="Crie uma jornada de estudo a partir de qualquer tema, sem precisar importar arquivos." action={<AcademyCreateDialog onCreate={create} isCreating={isCreating} />} />
      {error ? <p role="alert" className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p> : null}
      {isLoading ? (
        <div aria-label="Carregando estudos livres" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-72 rounded-2xl" />)}</div>
      ) : studies.length === 0 ? <AcademyEmptyState /> : (
        <section aria-labelledby="academy-recent-title" className="space-y-4">
          <div className="flex items-end justify-between gap-4 border-b pb-4">
            <div><h2 id="academy-recent-title" className="font-semibold">Estudos recentes</h2><p className="mt-1 text-sm text-muted-foreground">{studies.length} {studies.length === 1 ? "estudo livre" : "estudos livres"}</p></div>
          </div>
          <div className="content-fade grid gap-4 md:grid-cols-2 xl:grid-cols-3">{studies.map((study) => <AcademyStudyCard key={study.id} study={study} />)}</div>
        </section>
      )}
    </>
  );
}

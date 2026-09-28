"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { AcademyService } from "../services/AcademyService";
import type { AcademyContentKind, AcademyExportKind } from "../types";
import { AcademyContentViewer } from "./AcademyContentViewer";
import { AcademyCreateDialog } from "./AcademyCreateDialog";
import { AcademyEmptyState } from "./AcademyEmptyState";
import { AcademyGenerateDialog } from "./AcademyGenerateDialog";
import { AcademyStudyCard } from "./AcademyStudyCard";
import { useAcademyStudies } from "../hooks/useAcademyStudies";

export function AcademyPage() {
  const router = useRouter();
  const { studies, isLoading, isCreating, generatingStudyId, generationProgress, exportingKind, error, create, generate, exportContent } = useAcademyStudies();
  const [generatorStudyId, setGeneratorStudyId] = useState<string>();
  const [viewer, setViewer] = useState<{ studyId: string; contentId: string }>();
  const generatorStudy = studies.find((study) => study.id === generatorStudyId);
  const viewerStudy = studies.find((study) => study.id === viewer?.studyId);
  const viewerContent = useMemo(() => viewerStudy?.contents.find((content) => content.id === viewer?.contentId), [viewer, viewerStudy]);

  useEffect(() => {
    if (studies.length === 0 || viewer) return;
    const params = new URLSearchParams(window.location.search);
    const studyId = params.get("estudo");
    const study = studies.find((item) => item.id === studyId);
    const contentId = params.get("conteudo") ?? study?.contents[0]?.id;
    if (study && contentId && study.contents.some((content) => content.id === contentId)) setViewer({ studyId: study.id, contentId });
  }, [studies, viewer]);

  async function openProfessor(studyId: string) {
    await AcademyService.activate(studyId);
    router.push("/tutor?modo=professor");
  }

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
          <div className="content-fade grid gap-4 md:grid-cols-2 xl:grid-cols-3">{studies.map((study) => <AcademyStudyCard key={study.id} study={study} isGenerating={generatingStudyId === study.id} onGenerate={() => setGeneratorStudyId(study.id)} onOpenContent={() => { const contentId = study.contents[0]?.id; if (contentId) setViewer({ studyId: study.id, contentId }); }} onOpenProfessor={() => void openProfessor(study.id)} />)}</div>
        </section>
      )}
      {generatorStudy ? <AcademyGenerateDialog study={generatorStudy} open onOpenChange={(open) => !open && setGeneratorStudyId(undefined)} onGenerate={(kind: AcademyContentKind, force) => generate(generatorStudy, kind, force)} isGenerating={generatingStudyId === generatorStudy.id} progress={generationProgress} /> : null}
      {viewerStudy ? <AcademyContentViewer study={viewerStudy} content={viewerContent} open={Boolean(viewerContent)} onOpenChange={(open) => !open && setViewer(undefined)} onOpenProfessor={() => void openProfessor(viewerStudy.id)} onExport={(kind: AcademyExportKind) => viewerContent ? exportContent(viewerStudy, viewerContent, kind) : Promise.resolve()} exportingKind={exportingKind} /> : null}
    </>
  );
}

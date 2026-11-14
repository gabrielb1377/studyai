"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  FileText,
  FolderOpen,
  LayoutTemplate,
  Loader2,
  Pencil,
  Presentation,
  Sparkles,
} from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AcademyService } from "../services/AcademyService";
import { academyLabels, type AcademyStudy } from "../types";
import { StudioEditor } from "./StudioEditor";
import { StudioService } from "./service";
import { isPedagogicalTemplateId, studioPedagogicalTemplates } from "./templates";
import type { StudioDocument, StudioDocumentType, StudioPedagogicalTemplateId } from "./types";

type Selection = {
  studyId: string;
  contentId?: string;
  documentId?: string;
  docType: StudioDocumentType;
  pedagogicalTemplate?: StudioPedagogicalTemplateId;
};

export function StudioPage() {
  const router = useRouter();
  const [studies, setStudies] = useState<AcademyStudy[]>([]);
  const [documents, setDocuments] = useState<StudioDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pendingType, setPendingType] = useState<Record<string, StudioDocumentType>>({});
  const [pendingManualType, setPendingManualType] = useState<Record<string, StudioDocumentType>>({});
  const [pendingPedagogical, setPendingPedagogical] = useState<Record<string, StudioPedagogicalTemplateId>>({});
  const consumedUrlRef = useRef(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [academyStudies, studioDocuments] = await Promise.all([
        AcademyService.list(),
        StudioService.listDocuments(),
      ]);
      setStudies(academyStudies);
      setDocuments(studioDocuments);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os conteúdos do Studio.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Recupera a seleção a partir da URL (deep link vindo da Academy ou da Biblioteca).
  useEffect(() => {
    if (isLoading || selection || consumedUrlRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const studyId = params.get("estudo");
    const contentId = params.get("conteudo") || undefined;
    const documentId = params.get("documento") || undefined;
    const tipo = params.get("tipo") === "presentation" ? "presentation" : "document";
    const estrutura = params.get("estrutura");
    const pedagogicalTemplate = isPedagogicalTemplateId(estrutura) ? estrutura : undefined;
    if (!studyId) return;
    consumedUrlRef.current = true;
    setSelection({ studyId, contentId, documentId, docType: tipo, pedagogicalTemplate });
  }, [isLoading, selection]);

  const selectedStudy = useMemo(
    () => studies.find((study) => study.id === selection?.studyId),
    [studies, selection],
  );
  const selectedContent = useMemo(
    () => (selection?.contentId ? selectedStudy?.contents.find((content) => content.id === selection.contentId) : undefined),
    [selectedStudy, selection],
  );

  const open = (
    studyId: string,
    docType: StudioDocumentType,
    options?: {
      contentId?: string;
      documentId?: string;
      pedagogicalTemplate?: StudioPedagogicalTemplateId;
    },
  ) => {
    setSelection({
      studyId,
      contentId: options?.contentId,
      documentId: options?.documentId,
      docType,
      pedagogicalTemplate: options?.pedagogicalTemplate,
    });
    const params = new URLSearchParams({ estudo: studyId, tipo: docType });
    if (options?.contentId) params.set("conteudo", options.contentId);
    if (options?.documentId) params.set("documento", options.documentId);
    if (options?.pedagogicalTemplate) params.set("estrutura", options.pedagogicalTemplate);
    router.replace(`/academy/studio?${params.toString()}`, { scroll: false });
  };

  const openWorkspace = async (studyId: string) => {
    try {
      await AcademyService.activate(studyId);
      router.push("/estudo");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir o Workspace.");
    }
  };

  if (selection) {
    if (isLoading) {
      return (
        <div className="flex h-[70dvh] items-center justify-center" aria-label="Carregando Studio">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      );
    }
    if (!selectedStudy || (selection.contentId && !selectedContent)) {
      return (
        <div className="flex h-[70dvh] flex-col items-center justify-center gap-3 p-8 text-center">
          <FileText className="size-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Conteúdo não encontrado</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {error ?? "O conteúdo selecionado não existe mais. Escolha outro material na Academy."}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              consumedUrlRef.current = true;
              setSelection(null);
              router.replace("/academy/studio", { scroll: false });
            }}
          >
            <ArrowLeft className="size-3.5 me-1" aria-hidden="true" /> Escolher outro conteúdo
          </Button>
        </div>
      );
    }
    return (
      <StudioEditor
        study={selectedStudy}
        content={selectedContent}
        documentId={selection.documentId}
        docType={selection.docType}
        initialPedagogicalTemplate={selection.pedagogicalTemplate}
        onClose={() => {
          setSelection(null);
          void load();
          router.push("/academy");
        }}
        onOpenWorkspace={() => void openWorkspace(selectedStudy.id)}
      />
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Academy Studio"
        title="Editor visual de materiais"
        description="Edite documentos e apresentações gerados pela Academy, personalize templates e salve seu trabalho."
        action={
          <Button type="button" variant="outline" asChild>
            <Link href="/academy"><ArrowLeft className="size-3.5 me-1" aria-hidden="true" /> Voltar à Academy</Link>
          </Button>
        }
      />

      {error ? <p role="alert" className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p> : null}

      {isLoading ? (
        <div aria-label="Carregando conteúdos do Studio" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-40 rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-4" aria-labelledby="studio-documents-title">
            <div className="flex items-end justify-between gap-4 border-b pb-3">
              <div>
                <h2 id="studio-documents-title" className="font-semibold">Documentos do Studio</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {documents.length} {documents.length === 1 ? "documento salvo" : "documentos salvos"}
                </p>
              </div>
            </div>
            {documents.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhum documento salvo ainda. Abra um conteúdo da Academy abaixo para começar.
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {documents.map((document) => (
                  <li key={document.id}>
                    <div className="flex h-full flex-col gap-2 rounded-2xl border p-4">
                      <div className="flex items-start gap-2">
                        {document.type === "presentation" ? (
                          <Presentation className="size-4 shrink-0 text-primary" aria-hidden="true" />
                        ) : (
                          <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{document.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {document.type === "presentation" ? "Apresentação" : "Documento"} · versão {document.version}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[10px] capitalize">{document.status}</Badge>
                      </div>
                      <div className="mt-auto flex flex-wrap gap-2 pt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const study = studies.find((item) => item.id === document.studyId);
                            if (!study) return;
                            if (document.contentId) {
                              const content = study.contents.find((item) => item.id === document.contentId);
                              if (!content) return;
                              open(study.id, document.type, { contentId: content.id, documentId: document.id });
                              return;
                            }
                            open(study.id, document.type, {
                              documentId: document.id,
                              pedagogicalTemplate: document.pedagogicalTemplate,
                            });
                          }}
                        >
                          Reabrir no Studio
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => void openWorkspace(document.studyId)}>
                          Abrir no Workspace
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-4" aria-labelledby="studio-contents-title">
            <div className="flex items-end justify-between gap-4 border-b pb-3">
              <div>
                <h2 id="studio-contents-title" className="font-semibold">Conteúdos da Academy</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {studies.length} {studies.length === 1 ? "estudo" : "estudos"} disponíveis
                </p>
              </div>
            </div>
            {studies.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhum estudo criado ainda. <Link href="/academy" className="text-primary underline underline-offset-4">Crie um estudo na Academy</Link> para editar no Studio.
              </p>
            ) : (
              <div className="space-y-4">
                {studies.map((study) => (
                  <article key={study.id} className="rounded-2xl border p-4">
                    <header className="flex flex-wrap items-center gap-2">
                      <FolderOpen className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      <h3 className="font-semibold">{study.title}</h3>
                      <Badge variant="outline" className="text-[10px]">{academyLabels.contentKinds["study-material"]}</Badge>
                      <span className="text-xs text-muted-foreground">{study.subject} · {study.topic}</span>
                    </header>
                    {study.contents.length > 0 ? (
                      <ul className="mt-3 grid gap-2">
                        {study.contents.map((content) => {
                          const type = pendingType[content.id] ?? "document";
                          return (
                            <li key={content.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border bg-card/40 p-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{content.title}</p>
                                <p className="truncate text-xs text-muted-foreground">{content.objective}</p>
                              </div>
                              <div className="basis-full sm:w-40 sm:basis-auto">
                                <Select
                                  value={type}
                                  onValueChange={(value) => setPendingType((current) => ({ ...current, [content.id]: value as StudioDocumentType }))}
                                  options={[
                                    { value: "document", label: "Documento" },
                                    { value: "presentation", label: "Apresentação" },
                                  ]}
                                  aria-label={`Tipo de edição para ${content.title}`}
                                  className="h-8 text-xs"
                                />
                              </div>
                              <Button type="button" size="sm" onClick={() => open(study.id, type, { contentId: content.id })}>
                                <Sparkles className="size-3.5 me-1" aria-hidden="true" /> Abrir no Studio
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}

                    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-dashed bg-muted/20 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">Edição manual sem IA</p>
                        <p className="truncate text-xs text-muted-foreground">
                          Escolha um template pedagógico e construa seus blocos diretamente no Studio.
                        </p>
                      </div>
                      <div className="basis-full sm:w-48 sm:basis-auto">
                        <Select
                          value={pendingPedagogical[study.id] ?? "structured-lesson"}
                          onValueChange={(value) =>
                            setPendingPedagogical((current) => ({
                              ...current,
                              [study.id]: value as StudioPedagogicalTemplateId,
                            }))
                          }
                          options={studioPedagogicalTemplates.map((item) => ({ value: item.id, label: item.name }))}
                          aria-label={`Template pedagógico para ${study.title}`}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="basis-full sm:w-36 sm:basis-auto">
                        <Select
                          value={pendingManualType[study.id] ?? "document"}
                          onValueChange={(value) =>
                            setPendingManualType((current) => ({
                              ...current,
                              [study.id]: value as StudioDocumentType,
                            }))
                          }
                          options={[
                            { value: "document", label: "Documento" },
                            { value: "presentation", label: "Apresentação" },
                          ]}
                          aria-label={`Tipo de edição manual para ${study.title}`}
                          className="h-8 text-xs"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={study.contents.length === 0 ? "default" : "outline"}
                        onClick={() =>
                          open(study.id, pendingManualType[study.id] ?? "document", {
                            pedagogicalTemplate: pendingPedagogical[study.id] ?? "structured-lesson",
                          })
                        }
                      >
                        <Pencil className="size-3.5 me-1" aria-hidden="true" /> Editar manualmente no Studio
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border bg-muted/30 p-5" aria-labelledby="studio-next-title">
            <h2 id="studio-next-title" className="flex items-center gap-2 font-semibold">
              <LayoutTemplate className="size-4 text-primary" aria-hidden="true" /> Próximos passos
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><BookOpen className="size-3.5" aria-hidden="true" /> Exporte em PDF ou PowerPoint na aba Exportar para publicar na Biblioteca e consultar no Workspace ou no Tutor.</li>
              <li className="flex items-center gap-2"><Sparkles className="size-3.5" aria-hidden="true" /> A assistência por IA usa o mesmo AI Core do restante do StudyAI, com as suas chaves (BYOK).</li>
            </ul>
          </section>
        </div>
      )}
    </>
  );
}

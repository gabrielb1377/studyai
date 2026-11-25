import Link from "next/link";
import { ArrowLeft, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StudyRecord } from "@/types/study-engine";

export function StudyHeader({
  study,
  fileName,
  returnHref,
  focusMode = false,
  sidebarVisible = false,
  onToggleSidebar,
}: {
  study: StudyRecord;
  fileName?: string;
  returnHref?: string;
  focusMode?: boolean;
  sidebarVisible?: boolean;
  onToggleSidebar?: () => void;
}) {
  const backHref = returnHref ?? "/";
  const backLabel = returnHref === "/biblioteca" ? "Biblioteca" : returnHref ? "Semana de Prova" : "Dashboard";

  if (focusMode) {
    return (
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {study.subject}
          </p>
          <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
            {study.title}
            {fileName ? <span className="font-normal text-muted-foreground"> · {fileName}</span> : null}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onToggleSidebar ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-expanded={sidebarVisible}
              onClick={onToggleSidebar}
            >
              {sidebarVisible ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
              {sidebarVisible ? "Ocultar navegação" : "Mostrar navegação"}
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={backHref}>
              <ArrowLeft className="size-4" />
              {backLabel === "Dashboard" ? "Voltar ao Dashboard" : `Voltar à ${backLabel}`}
            </Link>
          </Button>
        </div>
      </header>
    );
  }

  return (
    <header className="mb-8 border-b pb-7 sm:mb-10 sm:pb-8">
      <nav aria-label="Breadcrumb" className="mb-5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0">{backLabel}</span>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{study.subject}</span>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate text-foreground" aria-current="page">
          {study.title}
        </span>
        {fileName && (
          <>
            <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate text-foreground" aria-current="page">{fileName}</span>
          </>
        )}
      </nav>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {study.subject}
          </p>
          <h1 className="mt-3 type-page-title">
            {study.title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {study.course ? `${study.course}${study.semester ? ` · ${study.semester}` : ""}` : "Materiais organizados neste tema."}
          </p>
        </div>
        <Button asChild variant="outline" className="h-10 shrink-0 self-start sm:self-auto">
          <Link href={backHref}>
            <ArrowLeft className="size-4" />
            {backLabel === "Dashboard" ? "Voltar ao Dashboard" : `Voltar à ${backLabel}`}
          </Link>
        </Button>
      </div>
    </header>
  );
}

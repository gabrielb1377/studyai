"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { markdownToSafeHtml } from "../sanitize";
import { resolveStudioTheme, studioColorSchemes } from "../export/theme";
import type { DocumentStructure, Slide, StudioCustomization } from "../types";

/** 1 ponto tipográfico equivale a 1,333 px na renderização do navegador. */
const PT_TO_PX = 96 / 72;

interface StudioPreviewPanelProps {
  structure?: DocumentStructure;
  slides?: Slide[];
  docType: "document" | "presentation";
  customization: StudioCustomization;
}

function pageCountFor(structure: DocumentStructure | undefined, customization: StudioCustomization) {
  const sections = structure?.sections.length ?? 0;
  const cover = customization.coverPage.enabled ? 1 : 0;
  const toc = customization.tableOfContents.enabled ? 1 : 0;
  return Math.max(1, sections + cover + toc);
}

export function StudioPreviewPanel({ structure, slides = [], docType, customization }: StudioPreviewPanelProps) {
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(0);
  const [device, setDevice] = useState<"mobile" | "tablet" | "desktop">("desktop");
  const [exportMode, setExportMode] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  const theme = useMemo(() => resolveStudioTheme(customization), [customization]);
  const pages = useMemo(
    () => (docType === "presentation" ? Math.max(1, slides.length) : pageCountFor(structure, customization)),
    [docType, slides.length, structure, customization],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const available = element.clientWidth;
      if (!available) return;
      const pageWidthPx = (theme.page.width * PT_TO_PX) / 100;
      setScale(Math.min(1, available / pageWidthPx));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [theme.page.width]);

  useEffect(() => {
    setPage(0);
  }, [docType, structure?.sections.length, slides.length]);

  const pageWidth = theme.page.width * PT_TO_PX;
  const pageHeight = theme.page.height * PT_TO_PX;
  const marginLeft = theme.page.margins.left * 72 * PT_TO_PX;
  const marginRight = theme.page.margins.right * 72 * PT_TO_PX;
  const marginTop = theme.page.margins.top * 72 * PT_TO_PX;
  const marginBottom = theme.page.margins.bottom * 72 * PT_TO_PX;

  const deviceWidth = device === "mobile" ? "375px" : device === "tablet" ? "768px" : "100%";
  const effectiveScale = exportMode ? scale * (zoom / 100) : zoom / 100;

  const renderDocumentPage = () => {
    if (!structure) {
      return <p className="p-8 text-center text-sm text-muted-foreground">Nada para pré-visualizar.</p>;
    }
    const coverOffset = customization.coverPage.enabled ? 1 : 0;
    const tocOffset = customization.tableOfContents.enabled ? 1 : 0;
    const contentPage = page - coverOffset - tocOffset;

    if (customization.coverPage.enabled && page === 0) {
      return (
        <div className="flex h-full flex-col justify-center p-10" style={{ background: theme.colors.accent, color: theme.colors.onAccent }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: `${theme.colors.onAccent}99` }}>
            StudyAI Academy
          </p>
          <h1 className="mt-3 text-4xl font-bold" style={{ fontFamily: theme.font.web }}>
            {customization.coverPage.title || structure.title}
          </h1>
          {customization.coverPage.subtitle || structure.subtitle ? (
            <p className="mt-3 text-lg" style={{ color: `${theme.colors.onAccent}cc` }}>
              {customization.coverPage.subtitle || structure.subtitle}
            </p>
          ) : null}
          <p className="mt-8 text-sm" style={{ color: `${theme.colors.onAccent}99` }}>
            {customization.coverPage.author}
            {customization.coverPage.date ? ` · ${customization.coverPage.date}` : ""}
          </p>
        </div>
      );
    }

    if (customization.tableOfContents.enabled && page === coverOffset) {
      return (
        <div className="p-10" style={{ color: theme.colors.ink }}>
          <h2 className="border-b pb-3 text-2xl font-bold" style={{ borderColor: `${theme.colors.accent}33`, fontFamily: theme.font.web }}>
            Sumário
          </h2>
          <ol className="mt-4 space-y-2">
            {structure.sections.filter((section) => section.type === "heading").map((section, index) => (
              <li key={section.id} className="flex items-center gap-2 text-sm">
                <span style={{ color: theme.colors.accent }}>{index + 1}.</span>
                <span>{section.title || "Seção"}</span>
              </li>
            ))}
          </ol>
        </div>
      );
    }

    const section = structure.sections[contentPage];
    if (!section) {
      return <p className="p-8 text-center text-sm text-muted-foreground">Página não disponível.</p>;
    }

    return (
      <div className="flex h-full flex-col" style={{ color: theme.colors.ink }}>
        <div className="flex-1">
          {section.title ? (
            <h2 className="text-2xl font-bold" style={{ color: theme.colors.accent, fontFamily: theme.font.web }}>
              {section.title}
            </h2>
          ) : null}
          <div
            className="studio-content mt-3 max-w-none"
            style={{ fontSize: theme.type.body * PT_TO_PX, lineHeight: theme.type.bodyLeading * PT_TO_PX, fontFamily: theme.font.web }}
            dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(section.content) }}
          />
        </div>
        {customization.headerFooter.enabled ? (
          <div className="mt-8 flex items-center justify-between border-t pt-3 text-[11px]" style={{ borderColor: `${theme.colors.accent}22`, color: theme.colors.muted }}>
            <span>{customization.headerFooter.headerText || structure.title}</span>
            <span>
              {customization.headerFooter.footerText}
              {customization.headerFooter.showPageNumbers && customization.pageNumbering !== "none"
                ? ` · ${contentPage + coverOffset + tocOffset + 1}`
                : ""}
            </span>
          </div>
        ) : null}
      </div>
    );
  };

  const renderPresentationPage = () => {
    const slide = slides[page];
    if (!slide) {
      return <p className="p-8 text-center text-sm text-muted-foreground">Nenhum slide para exibir.</p>;
    }
    return (
      <div className="flex h-full flex-col p-8" style={{ background: slide.background ?? theme.colors.surface, color: theme.colors.ink }}>
        <h1 className="text-3xl font-bold" style={{ color: theme.colors.accent, fontFamily: theme.font.web }}>
          {slide.title}
        </h1>
        <div
          className="studio-content mt-4 max-w-none"
          style={{ fontSize: theme.type.body * PT_TO_PX, lineHeight: theme.type.bodyLeading * PT_TO_PX, fontFamily: theme.font.web }}
          dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(slide.content) }}
        />
        {customization.headerFooter.enabled ? (
          <div className="mt-auto flex items-center justify-between pt-4 text-[11px]" style={{ color: theme.colors.muted }}>
            <span>StudyAI Academy</span>
            <span>{page + 1} / {slides.length}</span>
          </div>
        ) : null}
      </div>
    );
  };

  const isCoverPage = docType === "document" && customization.coverPage.enabled && page === 0;
  const pagePadding = exportMode
    ? `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`
    : "40px";

  const sheet = (
    <div
      className="overflow-hidden bg-white shadow-lg"
      style={{
        width: pageWidth,
        height: pageHeight,
        transform: `scale(${effectiveScale})`,
        transformOrigin: "top left",
        marginBottom: exportMode ? -(pageHeight * (1 - effectiveScale)) : undefined,
      }}
    >
      <div className="h-full w-full" style={{ padding: isCoverPage ? "0" : pagePadding }}>
        {docType === "presentation" ? renderPresentationPage() : renderDocumentPage()}
      </div>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-muted/30">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card p-3">
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-semibold">Prévia</span>
          <Badge variant="outline" className="text-xs capitalize">
            {docType === "presentation" ? "Apresentação" : "Documento"}
          </Badge>
          <Badge variant="outline" className="hidden text-[10px] capitalize sm:inline-flex">
            {studioColorSchemes[customization.colorScheme] ? customization.colorScheme : "default"}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="xs"
            variant={exportMode ? "secondary" : "ghost"}
            onClick={() => setExportMode((value) => !value)}
            aria-pressed={exportMode}
          >
            <Printer className="size-3 me-1" aria-hidden="true" /> Pré-visualizar exportação
          </Button>

          <Select
            value={device}
            onValueChange={(value) => setDevice(value as typeof device)}
            options={[
              { value: "mobile", label: "Mobile" },
              { value: "tablet", label: "Tablet" },
              { value: "desktop", label: "Desktop" },
            ]}
            aria-label="Dispositivo de pré-visualização"
            className="h-8 w-32 text-xs"
          />

          <div className="flex items-center gap-1">
            <Button type="button" size="icon-xs" variant="ghost" onClick={() => setZoom(Math.max(50, zoom - 10))} aria-label="Diminuir zoom">
              <span aria-hidden="true">−</span>
            </Button>
            <span className="w-14 text-center text-xs font-mono">{zoom}%</span>
            <Button type="button" size="icon-xs" variant="ghost" onClick={() => setZoom(Math.min(200, zoom + 10))} aria-label="Aumentar zoom">
              <span aria-hidden="true">+</span>
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button type="button" size="icon-xs" variant="ghost" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0} aria-label="Página anterior">
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="w-16 text-center text-xs font-mono">{page + 1} / {pages}</span>
            <Button type="button" size="icon-xs" variant="ghost" onClick={() => setPage((value) => Math.min(pages - 1, value + 1))} disabled={page >= pages - 1} aria-label="Próxima página">
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {exportMode ? (
        <p className="border-b bg-muted/40 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
          Simulação da página exportada (A4, margens e cabeçalho/rodapé do template). A paginação final do PDF pode diferir
          levemente do navegador; a prévia não substitui a conferência do arquivo gerado.
        </p>
      ) : null}

      <ScrollArea className="flex-1 p-4">
        <div ref={containerRef} className="mx-auto overflow-hidden" style={{ width: deviceWidth, maxWidth: "100%" }}>
          {sheet}
        </div>
      </ScrollArea>
    </div>
  );
}

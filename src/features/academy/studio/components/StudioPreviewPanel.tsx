"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { markdownToSafeHtml } from "../sanitize";
import type { DocumentStructure, Slide, StudioCustomization } from "../types";

const FONT_STACKS: Record<StudioCustomization["fontFamily"], string> = {
  aptos: "font-sans",
  inter: "font-sans",
  roboto: "font-sans",
  "source-serif": "font-serif",
  "ibm-plex": "font-mono",
  "noto-serif": "font-serif",
};

const FONT_SIZES: Record<StudioCustomization["fontSize"], string> = {
  small: "text-xs",
  medium: "text-sm",
  large: "text-base",
  xlarge: "text-lg",
};

const SPACINGS: Record<StudioCustomization["spacing"], string> = {
  compact: "space-y-2",
  normal: "space-y-4",
  relaxed: "space-y-6",
};

const COLOR_SCHEMES: Record<StudioCustomization["colorScheme"], { accent: string; pale: string; ink: string }> = {
  default: { accent: "#1f2937", pale: "#f3f4f6", ink: "#111827" },
  blue: { accent: "#2e5cb0", pale: "#edf3fc", ink: "#142947" },
  green: { accent: "#3f7d4f", pale: "#eef6ef", ink: "#1f3a25" },
  purple: { accent: "#6b4fa8", pale: "#f2eefb", ink: "#2f2148" },
  orange: { accent: "#b4652a", pale: "#fdf1e7", ink: "#4a2d15" },
  teal: { accent: "#2f8085", pale: "#e8f6f7", ink: "#14383a" },
  rose: { accent: "#a94a63", pale: "#fceef1", ink: "#421c26" },
};

interface StudioPreviewPanelProps {
  structure?: DocumentStructure;
  slides?: Slide[];
  docType: "document" | "presentation";
  customization: StudioCustomization;
}

export function StudioPreviewPanel({ structure, slides = [], docType, customization }: StudioPreviewPanelProps) {
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(0);
  const [device, setDevice] = useState<"mobile" | "tablet" | "desktop">("desktop");

  const colors = COLOR_SCHEMES[customization.colorScheme] ?? COLOR_SCHEMES.default;
  const fontClass = FONT_STACKS[customization.fontFamily] ?? "font-sans";
  const sizeClass = FONT_SIZES[customization.fontSize] ?? "text-sm";
  const spacingClass = SPACINGS[customization.spacing] ?? "space-y-4";

  const pages = useMemo(() => {
    if (docType === "presentation") return slides.length;
    if (!structure) return 1;
    return structure.sections.length + (customization.coverPage.enabled ? 1 : 0) + (customization.tableOfContents.enabled ? 1 : 0);
  }, [docType, slides.length, structure, customization.coverPage.enabled, customization.tableOfContents.enabled]);

  const deviceWidth = device === "mobile" ? "375px" : device === "tablet" ? "768px" : "100%";

  const renderDocumentPage = () => {
    if (!structure) {
      return <p className="p-8 text-center text-sm text-muted-foreground">Nada para pré-visualizar.</p>;
    }

    const coverOffset = customization.coverPage.enabled ? 1 : 0;
    const tocOffset = customization.tableOfContents.enabled ? 1 : 0;
    const contentPage = page - coverOffset - tocOffset;

    if (customization.coverPage.enabled && page === 0) {
      return (
        <div className="flex min-h-[560px] flex-col justify-center p-10" style={{ background: colors.accent }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#ffffff99" }}>
            StudyAI Academy
          </p>
          <h1 className={`mt-3 text-4xl font-bold ${fontClass}`} style={{ color: "#ffffff" }}>
            {customization.coverPage.title || structure.title}
          </h1>
          {customization.coverPage.subtitle || structure.subtitle ? (
            <p className="mt-3 text-lg" style={{ color: "#ffffffcc" }}>
              {customization.coverPage.subtitle || structure.subtitle}
            </p>
          ) : null}
          <p className="mt-8 text-sm" style={{ color: "#ffffff99" }}>
            {customization.coverPage.author}
            {customization.coverPage.date ? ` · ${customization.coverPage.date}` : ""}
          </p>
        </div>
      );
    }

    if (customization.tableOfContents.enabled && page === coverOffset) {
      return (
        <div className="min-h-[560px] p-10" style={{ color: colors.ink }}>
          <h2 className={`border-b pb-3 text-2xl font-bold ${fontClass}`} style={{ borderColor: `${colors.accent}33` }}>
            Sumário
          </h2>
          <ol className="mt-4 space-y-2">
            {structure.sections.filter((section) => section.type === "heading").map((section, index) => (
              <li key={section.id} className="flex items-center gap-2 text-sm">
                <span style={{ color: colors.accent }}>{index + 1}.</span>
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
      <div className={`min-h-[560px] p-10 ${spacingClass}`} style={{ color: colors.ink }}>
        {section.title ? (
          <h2 className={`text-2xl font-bold ${fontClass}`} style={{ color: colors.accent }}>
            {section.title}
          </h2>
        ) : null}
        <div
          className={`studio-content max-w-none leading-6 ${fontClass} ${sizeClass}`}
          dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(section.content) }}
        />
        {customization.headerFooter.enabled ? (
          <div className="mt-8 flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground" style={{ borderColor: `${colors.accent}22` }}>
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
      <div className="flex aspect-video flex-col p-8" style={{ background: slide.background ?? "#ffffff", color: colors.ink }}>
        <h1 className={`text-3xl font-bold ${fontClass}`} style={{ color: colors.accent }}>
          {slide.title}
        </h1>
        <div
          className={`studio-content mt-4 max-w-none leading-6 ${fontClass} ${sizeClass}`}
          dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(slide.content) }}
        />
        <div className="mt-auto flex items-center justify-between pt-4 text-[11px] text-muted-foreground">
          <span>StudyAI Academy</span>
          <span>{page + 1} / {slides.length}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-muted/30">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card p-3">
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-semibold">Prévia</span>
          <Badge variant="outline" className="text-xs capitalize">
            {docType === "presentation" ? "Apresentação" : "Documento"}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
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

      {/* Preview */}
      <ScrollArea className="flex-1 p-4">
        <div
          className="mx-auto overflow-hidden rounded-xl border bg-white shadow-lg transition-[width]"
          style={{ width: deviceWidth, maxWidth: "100%", transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
        >
          {docType === "presentation" ? renderPresentationPage() : renderDocumentPage()}
        </div>
      </ScrollArea>
    </div>
  );
}

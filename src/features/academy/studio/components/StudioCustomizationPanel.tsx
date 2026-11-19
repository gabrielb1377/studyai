"use client";

import { Palette, Type, AlignLeft, FileText, Hash, LayoutTemplate, Rows3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type {
  StudioColorScheme,
  StudioCustomization,
  StudioFontFamily,
  StudioFontSize,
  StudioOrientation,
  StudioPageMargins,
  StudioPageNumbering,
  StudioSpacing,
} from "../types";

const COLOR_SCHEMES: { id: StudioColorScheme; name: string; preview: string }[] = [
  { id: "default", name: "Padrão", preview: "bg-slate-800" },
  { id: "blue", name: "Azul", preview: "bg-blue-700" },
  { id: "green", name: "Verde", preview: "bg-emerald-700" },
  { id: "purple", name: "Roxo", preview: "bg-violet-700" },
  { id: "orange", name: "Laranja", preview: "bg-orange-600" },
  { id: "teal", name: "Azul-petróleo", preview: "bg-teal-700" },
  { id: "rose", name: "Rosa", preview: "bg-rose-700" },
];

const FONT_FAMILIES: { id: StudioFontFamily; label: string }[] = [
  { id: "aptos", label: "Aptos" },
  { id: "inter", label: "Inter" },
  { id: "roboto", label: "Roboto" },
  { id: "source-serif", label: "Source Serif" },
  { id: "ibm-plex", label: "IBM Plex" },
  { id: "noto-serif", label: "Noto Serif" },
];

const FONT_SIZES: { id: StudioFontSize; label: string }[] = [
  { id: "small", label: "Pequeno" },
  { id: "medium", label: "Médio" },
  { id: "large", label: "Grande" },
  { id: "xlarge", label: "Extra grande" },
];

const SPACINGS: { id: StudioSpacing; label: string }[] = [
  { id: "compact", label: "Compacto" },
  { id: "normal", label: "Normal" },
  { id: "relaxed", label: "Amplo" },
];

const ORIENTATIONS: { id: StudioOrientation; label: string }[] = [
  { id: "portrait", label: "Retrato" },
  { id: "landscape", label: "Paisagem" },
];

const MARGINS: { id: StudioPageMargins; label: string }[] = [
  { id: "compact", label: "Compacto" },
  { id: "normal", label: "Normal" },
  { id: "wide", label: "Amplo" },
];

const PAGE_NUMBERINGS: { id: StudioPageNumbering; label: string }[] = [
  { id: "none", label: "Sem numeração" },
  { id: "bottom-center", label: "Inferior central" },
  { id: "bottom-right", label: "Inferior direita" },
  { id: "top-right", label: "Superior direita" },
];

interface StudioCustomizationPanelProps {
  customization: StudioCustomization;
  onChange: (updates: Partial<StudioCustomization>) => void;
}

export function StudioCustomizationPanel({ customization, onChange }: StudioCustomizationPanelProps) {
  return (
    <div className="space-y-5 p-2">
      <section className="space-y-2" aria-labelledby="studio-color-title">
        <h4 id="studio-color-title" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Palette className="size-3.5" aria-hidden="true" /> Cores
        </h4>
        <div className="grid grid-cols-4 gap-2">
          {COLOR_SCHEMES.map((scheme) => (
            <button
              key={scheme.id}
              type="button"
              onClick={() => onChange({ colorScheme: scheme.id })}
              aria-pressed={customization.colorScheme === scheme.id}
              aria-label={`Esquema de cores ${scheme.name}`}
              className={`relative h-10 w-full overflow-hidden rounded-xl border-2 transition-all ${
                customization.colorScheme === scheme.id ? "border-primary ring-2 ring-primary" : "border-transparent hover:border-muted/50"
              }`}
            >
              <span className={`absolute inset-0 ${scheme.preview}`} aria-hidden="true" />
              {customization.colorScheme === scheme.id ? (
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white" aria-hidden="true">✓</span>
              ) : null}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Esquema ativo: {COLOR_SCHEMES.find((scheme) => scheme.id === customization.colorScheme)?.name}
        </p>
      </section>

      <section className="space-y-2" aria-labelledby="studio-font-title">
        <h4 id="studio-font-title" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Type className="size-3.5" aria-hidden="true" /> Tipografia
        </h4>
        <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
          Fonte
          <Select
            value={customization.fontFamily}
            onValueChange={(value) => onChange({ fontFamily: value as StudioFontFamily })}
            options={FONT_FAMILIES.map((font) => ({ value: font.id, label: font.label }))}
            aria-label="Fonte do documento"
            className="h-8 text-xs"
          />
        </label>
        <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
          Tamanho
          <Select
            value={customization.fontSize}
            onValueChange={(value) => onChange({ fontSize: value as StudioFontSize })}
            options={FONT_SIZES.map((size) => ({ value: size.id, label: size.label }))}
            aria-label="Tamanho da fonte"
            className="h-8 text-xs"
          />
        </label>
      </section>

      <section className="space-y-2" aria-labelledby="studio-layout-title">
        <h4 id="studio-layout-title" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <AlignLeft className="size-3.5" aria-hidden="true" /> Página
        </h4>
        <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
          Orientação
          <Select
            value={customization.orientation}
            onValueChange={(value) => onChange({ orientation: value as StudioOrientation })}
            options={ORIENTATIONS.map((orientation) => ({ value: orientation.id, label: orientation.label }))}
            aria-label="Orientação da página"
            className="h-8 text-xs"
          />
        </label>
        <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
          Margens
          <Select
            value={customization.pageMargins}
            onValueChange={(value) => onChange({ pageMargins: value as StudioPageMargins })}
            options={MARGINS.map((margin) => ({ value: margin.id, label: margin.label }))}
            aria-label="Margens da página"
            className="h-8 text-xs"
          />
        </label>
        <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
          Espaçamento
          <Select
            value={customization.spacing}
            onValueChange={(value) => onChange({ spacing: value as StudioSpacing })}
            options={SPACINGS.map((spacing) => ({ value: spacing.id, label: spacing.label }))}
            aria-label="Espaçamento do conteúdo"
            className="h-8 text-xs"
          />
        </label>
        <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
          Numeração
          <Select
            value={customization.pageNumbering}
            onValueChange={(value) => onChange({ pageNumbering: value as StudioPageNumbering })}
            options={PAGE_NUMBERINGS.map((numbering) => ({ value: numbering.id, label: numbering.label }))}
            aria-label="Numeração de páginas"
            className="h-8 text-xs"
          />
        </label>
      </section>

      <section className="space-y-2" aria-labelledby="studio-header-title">
        <h4 id="studio-header-title" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Rows3 className="size-3.5" aria-hidden="true" /> Cabeçalho e rodapé
        </h4>
        <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 rounded border-input accent-primary"
            checked={customization.headerFooter.enabled}
            onChange={(event) => onChange({ headerFooter: { ...customization.headerFooter, enabled: event.target.checked } })}
          />
          Exibir cabeçalho e rodapé
        </label>
        <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
          Cabeçalho
          <Input
            value={customization.headerFooter.headerText ?? ""}
            onChange={(event) => onChange({ headerFooter: { ...customization.headerFooter, headerText: event.target.value } })}
            placeholder="Texto do cabeçalho"
            className="h-8 text-xs"
          />
        </label>
        <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
          Rodapé
          <Input
            value={customization.headerFooter.footerText ?? ""}
            onChange={(event) => onChange({ headerFooter: { ...customization.headerFooter, footerText: event.target.value } })}
            placeholder="Texto do rodapé"
            className="h-8 text-xs"
          />
        </label>
      </section>

      <section className="space-y-2" aria-labelledby="studio-cover-title">
        <h4 id="studio-cover-title" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <FileText className="size-3.5" aria-hidden="true" /> Capa e sumário
        </h4>
        <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 rounded border-input accent-primary"
            checked={customization.coverPage.enabled}
            onChange={(event) => onChange({ coverPage: { ...customization.coverPage, enabled: event.target.checked } })}
          />
          Incluir página de capa
        </label>
        <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
          Autor
          <Input
            value={customization.coverPage.author ?? ""}
            onChange={(event) => onChange({ coverPage: { ...customization.coverPage, author: event.target.value } })}
            placeholder="Nome do autor"
            className="h-8 text-xs"
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 rounded border-input accent-primary"
            checked={customization.tableOfContents.enabled}
            onChange={(event) => onChange({ tableOfContents: { ...customization.tableOfContents, enabled: event.target.checked } })}
          />
          Incluir sumário
        </label>
      </section>

      <section className="space-y-2" aria-labelledby="studio-depth-title">
        <h4 id="studio-depth-title" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Hash className="size-3.5" aria-hidden="true" /> Profundidade do sumário
        </h4>
        <Select
          value={String(customization.tableOfContents.depth)}
          onValueChange={(value) => onChange({ tableOfContents: { ...customization.tableOfContents, depth: Number(value) as 1 | 2 | 3 } })}
          options={[
            { value: "1", label: "Apenas títulos principais" },
            { value: "2", label: "Dois níveis" },
            { value: "3", label: "Três níveis" },
          ]}
          aria-label="Profundidade do sumário"
          className="h-8 text-xs"
        />
      </section>

      <p className="flex items-start gap-1.5 rounded-xl bg-muted/40 p-3 text-[11px] leading-5 text-muted-foreground">
        <LayoutTemplate className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        A pré-visualização reflete as escolhas atuais. A exportação profissional com fidelidade total fica para a Sprint 37C.2.
      </p>
    </div>
  );
}

/**
 * Tokens visuais do Academy Studio.
 *
 * Fonte única de verdade para a pré-visualização, a exportação PDF e a
 * exportação PPTX. As personalizações escolhidas no Studio são resolvidas
 * aqui e consumidas pelos três renderizadores, evitando configurações de tema
 * paralelas.
 */

import type {
  StudioColorScheme,
  StudioCustomization,
  StudioFontFamily,
  StudioFontSize,
  StudioOrientation,
  StudioPageNumbering,
  StudioSpacing,
} from "../types";

export type StudioThemeColors = {
  /** Cor de destaque (títulos, réguas, capas). */
  accent: string;
  /** Versão clara da cor de destaque (fundos suaves). */
  accentSoft: string;
  /** Cor do texto principal. */
  ink: string;
  /** Cor de textos secundários. */
  muted: string;
  /** Fundo da página. */
  surface: string;
  /** Cor das bordas de tabela. */
  border: string;
  /** Texto sobre a cor de destaque. */
  onAccent: string;
};

export const studioColorSchemes: Record<StudioColorScheme, StudioThemeColors> = {
  default: { accent: "#1f2937", accentSoft: "#f3f4f6", ink: "#111827", muted: "#6b7280", surface: "#ffffff", border: "#e5e7eb", onAccent: "#ffffff" },
  blue: { accent: "#2e5cb0", accentSoft: "#edf3fc", ink: "#142947", muted: "#5b6b85", surface: "#ffffff", border: "#d6e0f2", onAccent: "#ffffff" },
  green: { accent: "#3f7d4f", accentSoft: "#eef6ef", ink: "#1f3a25", muted: "#5c7562", surface: "#ffffff", border: "#d5e7d9", onAccent: "#ffffff" },
  purple: { accent: "#6b4fa8", accentSoft: "#f2eefb", ink: "#2f2148", muted: "#6c6184", surface: "#ffffff", border: "#e2dbf4", onAccent: "#ffffff" },
  orange: { accent: "#b4652a", accentSoft: "#fdf1e7", ink: "#4a2d15", muted: "#7d6350", surface: "#ffffff", border: "#f2ddcb", onAccent: "#ffffff" },
  teal: { accent: "#2f8085", accentSoft: "#e8f6f7", ink: "#14383a", muted: "#547175", surface: "#ffffff", border: "#cfe6e8", onAccent: "#ffffff" },
  rose: { accent: "#a94a63", accentSoft: "#fceef1", ink: "#421c26", muted: "#7c5a65", surface: "#ffffff", border: "#f2d8de", onAccent: "#ffffff" },
};

export type StudioFontFamilySpec = {
  /** Nome da fonte para PPTX (tipo real aceito pelo PowerPoint). */
  pptx: string;
  /** Família equivalente no navegador. */
  css: string;
  /** Pilha de fontes para a pré-visualização no navegador. */
  web: string;
  /** Chave de fonte padrão do pdf-lib. */
  pdf: "sans" | "serif" | "mono";
  /** Variante em negrito para PDF. */
  pdfBold: "sans" | "serif" | "mono";
  /** True quando a fonte é monoespaçada. */
  mono: boolean;
};

export const studioFontFamilies: Record<StudioFontFamily, StudioFontFamilySpec> = {
  aptos: { pptx: "Aptos", css: "font-sans", web: '"Aptos", "Segoe UI", system-ui, sans-serif', pdf: "sans", pdfBold: "sans", mono: false },
  inter: { pptx: "Inter", css: "font-sans", web: '"Inter", system-ui, sans-serif', pdf: "sans", pdfBold: "sans", mono: false },
  roboto: { pptx: "Roboto", css: "font-sans", web: '"Roboto", system-ui, sans-serif', pdf: "sans", pdfBold: "sans", mono: false },
  "source-serif": { pptx: "Source Serif Pro", css: "font-serif", web: '"Source Serif Pro", Georgia, "Times New Roman", serif', pdf: "serif", pdfBold: "serif", mono: false },
  "ibm-plex": { pptx: "IBM Plex Mono", css: "font-mono", web: '"IBM Plex Mono", "Cascadia Code", Consolas, monospace', pdf: "mono", pdfBold: "mono", mono: true },
  "noto-serif": { pptx: "Noto Serif", css: "font-serif", web: '"Noto Serif", Georgia, "Times New Roman", serif', pdf: "serif", pdfBold: "serif", mono: false },
};

export type StudioTypeScale = {
  body: number;
  bodyLeading: number;
  h1: number;
  h2: number;
  h3: number;
  caption: number;
  code: number;
};

const fontSizeScales: Record<StudioFontSize, StudioTypeScale> = {
  small: { body: 9.5, bodyLeading: 13, h1: 19, h2: 13.5, h3: 11.5, caption: 7.5, code: 8 },
  medium: { body: 10.5, bodyLeading: 14.5, h1: 22, h2: 15, h3: 12.5, caption: 8, code: 8.5 },
  large: { body: 12, bodyLeading: 16.5, h1: 25, h2: 17, h3: 14, caption: 8.5, code: 9.5 },
  xlarge: { body: 13.5, bodyLeading: 18.5, h1: 28, h2: 19, h3: 15.5, caption: 9, code: 10.5 },
};

const spacingScales: Record<StudioSpacing, { paragraph: number; section: number; line: number }> = {
  compact: { paragraph: 4, section: 12, line: 1.15 },
  normal: { paragraph: 6, section: 18, line: 1.3 },
  relaxed: { paragraph: 9, section: 26, line: 1.45 },
};

export type StudioPageMargins = {
  /** Polegadas. */
  top: number;
  right: number;
  bottom: number;
  left: number;
};

const marginScales: Record<StudioCustomization["pageMargins"], StudioPageMargins> = {
  compact: { top: 0.55, right: 0.6, bottom: 0.6, left: 0.6 },
  normal: { top: 0.8, right: 0.9, bottom: 0.85, left: 0.9 },
  wide: { top: 1.05, right: 1.25, bottom: 1.1, left: 1.25 },
};

/** Tamanho de página em pontos (A4). */
export const STUDIO_PAGE_SIZE = { width: 595.28, height: 841.89 } as const;

export type StudioPageMetrics = {
  width: number;
  height: number;
  margins: StudioPageMargins;
  contentWidth: number;
  contentHeight: number;
  orientation: StudioOrientation;
};

export function resolvePageMetrics(customization: StudioCustomization): StudioPageMetrics {
  const margins = marginScales[customization.pageMargins] ?? marginScales.normal;
  const landscape = customization.orientation === "landscape";
  const width = landscape ? STUDIO_PAGE_SIZE.height : STUDIO_PAGE_SIZE.width;
  const height = landscape ? STUDIO_PAGE_SIZE.width : STUDIO_PAGE_SIZE.height;
  return {
    width,
    height,
    margins,
    contentWidth: width - (margins.left + margins.right) * 72,
    contentHeight: height - (margins.top + margins.bottom) * 72,
    orientation: customization.orientation,
  };
}

export type StudioTheme = {
  colors: StudioThemeColors;
  font: StudioFontFamilySpec;
  type: StudioTypeScale;
  spacing: { paragraph: number; section: number; line: number };
  page: StudioPageMetrics;
  pageNumbering: StudioPageNumbering;
  cover: StudioCustomization["coverPage"];
  headerFooter: StudioCustomization["headerFooter"];
  tableOfContents: StudioCustomization["tableOfContents"];
};

/** Resolve o tema completo a partir da customização escolhida no Studio. */
export function resolveStudioTheme(customization: StudioCustomization): StudioTheme {
  const colors = studioColorSchemes[customization.colorScheme] ?? studioColorSchemes.default;
  const font = studioFontFamilies[customization.fontFamily] ?? studioFontFamilies.aptos;
  const type = fontSizeScales[customization.fontSize] ?? fontSizeScales.medium;
  const spacing = spacingScales[customization.spacing] ?? spacingScales.normal;
  return {
    colors,
    font,
    type,
    spacing,
    page: resolvePageMetrics(customization),
    pageNumbering: customization.pageNumbering,
    cover: customization.coverPage,
    headerFooter: customization.headerFooter,
    tableOfContents: customization.tableOfContents,
  };
}

/** Converte "#rrggbb" em "rrggbb" (formato usado pelo OOXML). */
export function toHexRgb(hex: string): string {
  return hex.replace("#", "").toUpperCase();
}

/** Converte "#rrggbb" em componentes normalizados 0..1 (usado pelo pdf-lib). */
export function toRgbComponents(hex: string): { r: number; g: number; b: number } {
  const value = toHexRgb(hex);
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

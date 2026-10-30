import type { StudioTemplate, StudioCustomization, StudioDocumentTemplate, StudioDocumentType } from "./types";

export const defaultCustomization: StudioCustomization = {
  template: "academic",
  colorScheme: "default",
  fontFamily: "aptos",
  fontSize: "medium",
  spacing: "normal",
  orientation: "portrait",
  pageNumbering: "bottom-center",
  pageMargins: "normal",
  headerFooter: {
    enabled: true,
    headerText: "",
    footerText: "StudyAI Academy",
    showPageNumbers: true,
  },
  coverPage: {
    enabled: true,
    title: "",
    subtitle: "",
    author: "StudyAI Academy",
    date: new Date().toLocaleDateString("pt-BR"),
    logo: "",
  },
  tableOfContents: {
    enabled: true,
    depth: 2,
  },
};

function createCustomization(overrides: Partial<StudioCustomization>): StudioCustomization {
  return { ...defaultCustomization, ...overrides };
}

export const studioTemplates: StudioTemplate[] = [
  // DOCUMENT TEMPLATES
  {
    id: "academic",
    name: "Acadêmico",
    description: "Estrutura formal com numeração, sumário detalhado e referências. Ideal para artigos, teses e relatórios técnicos.",
    type: "document",
    tags: ["formal", "acadêmico", "estruturado", "sumário"],
    defaultCustomization: createCustomization({
      template: "academic",
      colorScheme: "blue",
      fontFamily: "source-serif",
      spacing: "normal",
      coverPage: { enabled: true, title: "", subtitle: "", author: "StudyAI Academy", date: new Date().toLocaleDateString("pt-BR") },
      tableOfContents: { enabled: true, depth: 3 },
    }),
  },
  {
    id: "modern",
    name: "Moderno",
    description: "Design limpo com espaçamento generoso, tipografia contemporânea e cores sutis. Ótimo para guias e materiais visuais.",
    type: "document",
    tags: ["clean", "contemporâneo", "visual", "espaçoso"],
    defaultCustomization: createCustomization({
      template: "modern",
      colorScheme: "teal",
      fontFamily: "inter",
      spacing: "relaxed",
      coverPage: { enabled: true, title: "", subtitle: "", author: "StudyAI Academy", date: new Date().toLocaleDateString("pt-BR") },
      tableOfContents: { enabled: true, depth: 2 },
    }),
  },
  {
    id: "minimalist",
    name: "Minimalista",
    description: "Foco no conteúdo com mínima decoração. Tipografia limpa, margens amplas e hierarquia sutil.",
    type: "document",
    tags: ["simples", "limpo", "foco", "essencial"],
    defaultCustomization: createCustomization({
      template: "minimalist",
      colorScheme: "default",
      fontFamily: "roboto",
      spacing: "normal",
      coverPage: { enabled: false },
      tableOfContents: { enabled: true, depth: 1 },
    }),
  },
  {
    id: "technical",
    name: "Técnico",
    description: "Otimizado para documentação técnica: blocos de código destacados, tabelas estruturadas, diagramas Mermaid integrados.",
    type: "document",
    tags: ["código", "técnico", "documentação", "desenvolvimento"],
    defaultCustomization: createCustomization({
      template: "technical",
      colorScheme: "purple",
      fontFamily: "ibm-plex",
      fontSize: "small",
      spacing: "compact",
      coverPage: { enabled: true, title: "", subtitle: "Documentação Técnica", author: "StudyAI Academy", date: new Date().toLocaleDateString("pt-BR") },
      tableOfContents: { enabled: true, depth: 3 },
    }),
  },
  {
    id: "workbook",
    name: "Apostila",
    description: "Formato didático com exercícios integrados, gabarito separado, espaços para anotações e questões de revisão.",
    type: "document",
    tags: ["didático", "exercícios", "gabarito", "estudo"],
    defaultCustomization: createCustomization({
      template: "workbook",
      colorScheme: "green",
      fontFamily: "aptos",
      spacing: "normal",
      coverPage: { enabled: true, title: "", subtitle: "Apostila de Estudos", author: "StudyAI Academy", date: new Date().toLocaleDateString("pt-BR") },
      tableOfContents: { enabled: true, depth: 2 },
    }),
  },
  {
    id: "ebook",
    name: "E-book",
    description: "Formato para leitura prolongada: capítulos fluidos, tipografia otimizada para tela, sumário navegável, capa personalizada.",
    type: "document",
    tags: ["leitura", "digital", "capítulos", "navegação"],
    defaultCustomization: createCustomization({
      template: "ebook",
      colorScheme: "rose",
      fontFamily: "noto-serif",
      fontSize: "large",
      spacing: "relaxed",
      orientation: "portrait",
      coverPage: { enabled: true, title: "", subtitle: "", author: "StudyAI Academy", date: new Date().toLocaleDateString("pt-BR") },
      tableOfContents: { enabled: true, depth: 2 },
    }),
  },

  // PRESENTATION TEMPLATES
  {
    id: "academic-presentation",
    name: "Acadêmico",
    description: "Estrutura formal para defesas, seminários e aulas: slide de objetivos, desenvolvimento estruturado, referências.",
    type: "presentation",
    tags: ["formal", "defesa", "seminário", "aula"],
    defaultCustomization: createCustomization({
      template: "academic-presentation",
      colorScheme: "blue",
      fontFamily: "aptos",
      orientation: "landscape",
      coverPage: { enabled: true, title: "", subtitle: "", author: "StudyAI Academy", date: new Date().toLocaleDateString("pt-BR") },
    }),
  },
  {
    id: "professional-presentation",
    name: "Profissional",
    description: "Design corporativo limpo para apresentações de trabalho, relatórios executivos e propostas.",
    type: "presentation",
    tags: ["corporativo", "executivo", "limpo", "formal"],
    defaultCustomization: createCustomization({
      template: "professional-presentation",
      colorScheme: "teal",
      fontFamily: "inter",
      orientation: "landscape",
      coverPage: { enabled: true, title: "", subtitle: "", author: "StudyAI Academy", date: new Date().toLocaleDateString("pt-BR") },
    }),
  },
  {
    id: "modern-presentation",
    name: "Moderno",
    description: "Visual contemporâneo com tipografia bold, cores vibrantes e layouts assimétricos. Ideal para pitches e workshops.",
    type: "presentation",
    tags: ["moderno", "vibrante", "pitch", "workshop"],
    defaultCustomization: createCustomization({
      template: "modern-presentation",
      colorScheme: "purple",
      fontFamily: "aptos",
      orientation: "landscape",
      coverPage: { enabled: true, title: "", subtitle: "", author: "StudyAI Academy", date: new Date().toLocaleDateString("pt-BR") },
    }),
  },
  {
    id: "minimalist-presentation",
    name: "Minimalista",
    description: "Menos é mais: slides limpos, muito espaço branco, foco no conteúdo essencial. Estilo 'menos slides, mais impacto'.",
    type: "presentation",
    tags: ["clean", "essencial", "zen", "focado"],
    defaultCustomization: createCustomization({
      template: "minimalist-presentation",
      colorScheme: "default",
      fontFamily: "roboto",
      orientation: "landscape",
      coverPage: { enabled: false },
    }),
  },
  {
    id: "tech-presentation",
    name: "Tecnológico",
    description: "Tema escuro com acentos neon, sintaxe de código destacada, diagramas técnicos. Para devs e engenheiros.",
    type: "presentation",
    tags: ["dark", "código", "dev", "engenharia", "técnico"],
    defaultCustomization: createCustomization({
      template: "tech-presentation",
      colorScheme: "purple",
      fontFamily: "ibm-plex",
      orientation: "landscape",
      coverPage: { enabled: true, title: "", subtitle: "Apresentação Técnica", author: "StudyAI Academy", date: new Date().toLocaleDateString("pt-BR") },
    }),
  },
  {
    id: "education-presentation",
    name: "Educação",
    description: "Design didático com objetivos de aprendizagem, exercícios intercalados, recapitulações e espaço para anotações.",
    type: "presentation",
    tags: ["didático", "aula", "educação", "aprendizagem"],
    defaultCustomization: createCustomization({
      template: "education-presentation",
      colorScheme: "green",
      fontFamily: "aptos",
      orientation: "landscape",
      coverPage: { enabled: true, title: "", subtitle: "Material Didático", author: "StudyAI Academy", date: new Date().toLocaleDateString("pt-BR") },
    }),
  },
];

export function getTemplateById(id: StudioDocumentTemplate): StudioTemplate | undefined {
  return studioTemplates.find((t) => t.id === id);
}

export function getTemplatesByType(type: StudioDocumentType): StudioTemplate[] {
  return studioTemplates.filter((t) => t.type === type);
}

export function getAllTemplates(): StudioTemplate[] {
  return studioTemplates;
}
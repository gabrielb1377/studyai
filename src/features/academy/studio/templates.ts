import type {
  StudioTemplate,
  StudioCustomization,
  StudioDocumentTemplate,
  StudioDocumentType,
  StudioPedagogicalTemplate,
  StudioPedagogicalTemplateId,
} from "./types";

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

export const studioPedagogicalTemplates: StudioPedagogicalTemplate[] = [
  {
    id: "structured-lesson",
    name: "Aula estruturada",
    description: "Roteiro didático completo com objetivos, introdução, conceitos fundamentais, exemplo aplicado, atividade e síntese.",
    objective: "Guiar o estudo passo a passo do conceito à prática.",
    tags: ["aula", "roteiro", "exemplos", "síntese"],
    recommendedVisualTemplate: "academic",
    buildSections: ({ topic, subject }) => [
      {
        type: "heading",
        title: "Objetivos da aula",
        content: `- Compreender os fundamentos de ${topic}\n- Relacionar ${topic} ao contexto de ${subject}\n- Aplicar os conceitos em exemplos e atividades`,
        level: 1,
      },
      {
        type: "paragraph",
        title: "Introdução e contexto",
        content: `Contextualize o tema ${topic} dentro de ${subject}, destacando sua relevância e aplicações principais.`,
        level: 2,
      },
      {
        type: "heading",
        title: "Conceitos fundamentais",
        content: `Desenvolva a explicação central sobre ${topic}, definindo os termos essenciais e suas relações.`,
        level: 1,
      },
      {
        type: "example",
        title: "Exemplo aplicado",
        content: `- Situação prática envolvendo ${topic}\n- Passo a passo comentado da resolução`,
        level: 2,
      },
      {
        type: "exercise",
        title: "Atividade de verificação",
        content: `**1. Explique com suas palavras o conceito central de ${topic}.**\n\nDica: revise os conceitos fundamentais apresentados na aula.\n\nResposta: registre aqui a síntese esperada.`,
        level: 2,
      },
      {
        type: "summary",
        title: "Síntese da aula",
        content: `Resumo dos pontos essenciais trabalhados nesta aula sobre ${topic}.`,
        level: 1,
      },
    ],
    buildSlides: ({ title, topic, subject }) => [
      {
        layout: "cover",
        title: title || topic,
        content: `Aula estruturada · ${subject}`,
        presenterNotes: `Apresente os objetivos da aula sobre ${topic}.`,
      },
      {
        layout: "title-content",
        title: "Objetivos da aula",
        content: `- Compreender os fundamentos de ${topic}\n- Aplicar os conceitos em ${subject}`,
      },
      {
        layout: "title-content",
        title: "Conceitos fundamentais",
        content: `Pontos centrais sobre ${topic}.`,
      },
      {
        layout: "title-content",
        title: "Exemplo aplicado",
        content: `- Demonstração prática de ${topic}`,
      },
      {
        layout: "exercise",
        title: "Atividade de verificação",
        content: `**1. Como aplicar ${topic} na prática?**\n\nResposta: síntese comentada.`,
      },
      {
        layout: "summary",
        title: "Síntese da aula",
        content: `Principais conclusões sobre ${topic}.`,
      },
    ],
  },
  {
    id: "structured-summary",
    name: "Resumo esquematizado",
    description: "Síntese direta para revisão rápida com visão geral, conceitos-chave, esquema de tópicos, quadro comparativo e alertas.",
    objective: "Consolidar e revisar rapidamente os conceitos essenciais.",
    tags: ["resumo", "revisão", "esquema", "síntese"],
    recommendedVisualTemplate: "modern",
    buildSections: ({ topic, subject }) => [
      {
        type: "summary",
        title: "Visão geral",
        content: `Síntese central sobre ${topic} na disciplina de ${subject}.`,
        level: 1,
      },
      {
        type: "list",
        title: "Conceitos-chave",
        content: `- Conceito 1: definição objetiva sobre ${topic}\n- Conceito 2: propriedade ou regra essencial\n- Conceito 3: aplicação direta`,
        level: 2,
      },
      {
        type: "heading",
        title: "Esquema dos tópicos",
        content: `Organize a relação lógica entre as partes principais de ${topic}.`,
        level: 1,
      },
      {
        type: "table",
        title: "Quadro comparativo",
        content: `| Conceito | Característica principal | Quando aplicar |\n| --- | --- | --- |\n| Aspecto A | Definição essencial | Situação padrão |\n| Aspecto B | Diferença crítica | Casos específicos |`,
        level: 2,
      },
      {
        type: "blockquote",
        title: "Pontos de atenção para revisão",
        content: `Registre exceções, fórmulas críticas ou erros frequentes relacionados a ${topic}.`,
        level: 2,
      },
    ],
    buildSlides: ({ title, topic, subject }) => [
      {
        layout: "cover",
        title: title || topic,
        content: `Resumo esquematizado · ${subject}`,
      },
      {
        layout: "summary",
        title: "Visão geral",
        content: `Síntese central sobre ${topic}.`,
      },
      {
        layout: "title-content",
        title: "Conceitos-chave",
        content: `- Conceito 1\n- Conceito 2\n- Conceito 3`,
      },
      {
        layout: "comparison",
        title: "Quadro comparativo",
        content: `Comparação entre os elementos principais de ${topic}.`,
      },
      {
        layout: "title-content",
        title: "Pontos de atenção",
        content: `Lembretes essenciais para revisão de ${topic}.`,
      },
    ],
  },
  {
    id: "exercise-list",
    name: "Lista de exercícios",
    description: "Bateria de prática com orientações, questões progressivas (conceitual, prática e aprofundamento) e gabarito comentado.",
    objective: "Treinar resolução de questões e fixar o conteúdo na prática.",
    tags: ["exercícios", "prática", "questões", "gabarito"],
    recommendedVisualTemplate: "workbook",
    buildSections: ({ topic, subject }) => [
      {
        type: "paragraph",
        title: "Orientações de resolução",
        content: `Lista de exercícios sobre ${topic} (${subject}). Resolva cada questão antes de consultar o gabarito.`,
        level: 1,
      },
      {
        type: "exercise",
        title: "Questão 1 — Conceitual",
        content: `**1. Defina os princípios fundamentais de ${topic} e explique sua importância em ${subject}.**\n\nDica: identifique os elementos centrais do conceito.\n\nResposta: descreva a resposta fundamentada.`,
        level: 1,
      },
      {
        type: "exercise",
        title: "Questão 2 — Aplicação prática",
        content: `**2. Resolva um problema prático aplicando ${topic}.**\n\nDica: divida o raciocínio em etapas claras.\n\nResposta: detalhe o passo a passo da solução.`,
        level: 1,
      },
      {
        type: "exercise",
        title: "Questão 3 — Aprofundamento",
        content: `**3. Analise um caso crítico ou armadilha comum envolvendo ${topic}.**\n\nDica: compare as hipóteses possíveis.\n\nResposta: justifique a alternativa ou conclusão correta.`,
        level: 1,
      },
      {
        type: "summary",
        title: "Gabarito e revisão de erros",
        content: `Anote aqui os pontos consolidados e os tópicos de ${topic} que exigem revisão complementar.`,
        level: 2,
      },
    ],
    buildSlides: ({ title, topic, subject }) => [
      {
        layout: "cover",
        title: title || topic,
        content: `Lista de exercícios · ${subject}`,
      },
      {
        layout: "exercise",
        title: "Questão 1 — Conceitual",
        content: `**1. Princípios fundamentais de ${topic}.**\n\nResposta: resolução comentada.`,
      },
      {
        layout: "exercise",
        title: "Questão 2 — Aplicação prática",
        content: `**2. Caso prático de ${topic}.**\n\nResposta: passo a passo da solução.`,
      },
      {
        layout: "exercise",
        title: "Questão 3 — Aprofundamento",
        content: `**3. Análise crítica sobre ${topic}.**\n\nResposta: justificativa completa.`,
      },
      {
        layout: "summary",
        title: "Gabarito e revisão",
        content: `Síntese das respostas sobre ${topic}.`,
      },
    ],
  },
  {
    id: "textbook-chapter",
    name: "Capítulo de apostila",
    description: "Capítulo completo de material didático com contextualização, fundamentação teórica, regras, exemplo resolvido, exercícios e resumo.",
    objective: "Construir material de referência aprofundado por capítulo.",
    tags: ["apostila", "capítulo", "teoria", "aprofundado"],
    recommendedVisualTemplate: "ebook",
    buildSections: ({ topic, subject }) => [
      {
        type: "heading",
        title: "1. Contextualização do capítulo",
        content: `Apresentação do capítulo sobre ${topic} na disciplina de ${subject} e conhecimentos prévios recomendados.`,
        level: 1,
      },
      {
        type: "paragraph",
        title: "1.1 Fundamentação teórica",
        content: `Desenvolvimento detalhado das definições, princípios e fundamentos teóricos de ${topic}.`,
        level: 2,
      },
      {
        type: "list",
        title: "1.2 Propriedades e regras principais",
        content: `- Primeira propriedade essencial de ${topic}\n- Segunda regra e condições de aplicação\n- Observações e casos particulares`,
        level: 2,
      },
      {
        type: "example",
        title: "1.3 Exemplo resolvido",
        content: `Demonstração passo a passo aplicando a teoria do capítulo sobre ${topic}.`,
        level: 2,
      },
      {
        type: "exercise",
        title: "Exercícios de fixação",
        content: `**1. Questão de revisão do capítulo sobre ${topic}.**\n\nDica: consulte a seção 1.1.\n\nResposta: resolução comentada do capítulo.`,
        level: 1,
      },
      {
        type: "summary",
        title: "Resumo do capítulo",
        content: `Fechamento com as ideias centrais estudadas neste capítulo sobre ${topic}.`,
        level: 1,
      },
    ],
    buildSlides: ({ title, topic, subject }) => [
      {
        layout: "cover",
        title: title || topic,
        content: `Capítulo de apostila · ${subject}`,
      },
      {
        layout: "title-content",
        title: "1. Contextualização do capítulo",
        content: `Introdução ao estudo de ${topic}.`,
      },
      {
        layout: "title-content",
        title: "1.1 Fundamentação teórica",
        content: `Conceitos e bases teóricas de ${topic}.`,
      },
      {
        layout: "title-content",
        title: "1.3 Exemplo resolvido",
        content: `Aplicação comentada de ${topic}.`,
      },
      {
        layout: "exercise",
        title: "Exercícios de fixação",
        content: `**1. Exercício do capítulo sobre ${topic}.**\n\nResposta: resolução comentada.`,
      },
      {
        layout: "summary",
        title: "Resumo do capítulo",
        content: `Síntese final do capítulo sobre ${topic}.`,
      },
    ],
  },
  {
    id: "blank-document",
    name: "Documento em branco",
    description: "Estrutura limpa com uma seção inicial aberta para escrever livremente no seu próprio formato.",
    objective: "Escrever um estudo livre do zero sem estrutura pré-definida.",
    tags: ["em branco", "livre", "autoral", "simples"],
    recommendedVisualTemplate: "minimalist",
    buildSections: () => [
      {
        type: "paragraph",
        title: "Introdução",
        content: "",
        level: 1,
      },
    ],
    buildSlides: ({ title, topic }) => [
      {
        layout: "title-content",
        title: title || topic || "Slide 1",
        content: "",
      },
    ],
  },
];

export function getPedagogicalTemplateById(id: StudioPedagogicalTemplateId): StudioPedagogicalTemplate | undefined {
  return studioPedagogicalTemplates.find((template) => template.id === id);
}

export function getAllPedagogicalTemplates(): StudioPedagogicalTemplate[] {
  return studioPedagogicalTemplates;
}

export function isPedagogicalTemplateId(value: string | null | undefined): value is StudioPedagogicalTemplateId {
  return Boolean(value && studioPedagogicalTemplates.some((template) => template.id === value));
}

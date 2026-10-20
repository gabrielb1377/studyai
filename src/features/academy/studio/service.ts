import type {
  StudioDocument,
  StudioDocumentType,
  StudioContentKind,
  StudioCustomization,
  StudioDocumentTemplate,
  StudioExportRecord,
  DocumentStructure,
  DocumentSection,
  Slide,
  StudioEditorState,
} from "./types";
import { StudioStorage } from "./storage";
import { AcademyStorage } from "../storage/AcademyStorage";
import { getTemplateById } from "./templates";
import type { AcademyGeneratedContent, AcademyStudy } from "../types";

function generateId() {
  return crypto.randomUUID();
}

function createDefaultCustomization(templateId: StudioDocumentTemplate): StudioCustomization {
  const template = getTemplateById(templateId);
  return template?.defaultCustomization ?? {
    template: "academic",
    colorScheme: "default",
    fontFamily: "aptos",
    fontSize: "medium",
    spacing: "normal",
    orientation: "portrait",
    pageNumbering: "bottom-center",
    pageMargins: "normal",
    headerFooter: { enabled: true, headerText: "", footerText: "StudyAI Academy", showPageNumbers: true },
    coverPage: { enabled: true, title: "", subtitle: "", author: "StudyAI Academy", date: new Date().toLocaleDateString("pt-BR") },
    tableOfContents: { enabled: true, depth: 2 },
  };
}

/**
 * Converte o conteúdo gerado pela Academy em uma estrutura editável.
 * O conteúdo original é preservado integralmente nas seções.
 */
function createDefaultDocumentStructure(content: AcademyGeneratedContent): DocumentStructure {
  const sections: DocumentSection[] = [];

  content.chapters.forEach((chapter, chapterIndex) => {
    sections.push({
      id: generateId(),
      type: "heading",
      title: chapter.title,
      content: chapter.content,
      level: 1,
      order: sections.length,
    });

    if (chapter.objective) {
      sections.push({
        id: generateId(),
        type: "paragraph",
        title: "Objetivo",
        content: chapter.objective,
        level: 2,
        order: sections.length,
      });
    }

    if (chapter.concepts.length) {
      sections.push({
        id: generateId(),
        type: "list",
        title: "Conceitos principais",
        content: chapter.concepts.map((concept) => `- ${concept}`).join("\n"),
        level: 2,
        order: sections.length,
      });
    }

    if (chapter.examples.length) {
      sections.push({
        id: generateId(),
        type: "example",
        title: "Exemplos",
        content: chapter.examples.map((example) => `- ${example}`).join("\n"),
        level: 2,
        order: sections.length,
      });
    }

    void chapterIndex;
  });

  if (content.exercises.length) {
    sections.push({
      id: generateId(),
      type: "exercise",
      title: "Exercícios",
      content: content.exercises
        .map((exercise, index) => `**${index + 1}. ${exercise.question}**\n\n${exercise.guidance ? `Dica: ${exercise.guidance}\n\n` : ""}Resposta: ${exercise.answer}`)
        .join("\n\n"),
      level: 1,
      order: sections.length,
    });
  }

  if (content.summary) {
    sections.push({
      id: generateId(),
      type: "summary",
      title: "Resumo",
      content: content.summary,
      level: 1,
      order: sections.length,
    });
  }

  if (content.review.length) {
    sections.push({
      id: generateId(),
      type: "list",
      title: "Revisão",
      content: content.review.map((item) => `- ${item}`).join("\n"),
      level: 2,
      order: sections.length,
    });
  }

  return {
    id: generateId(),
    title: content.title,
    subtitle: content.objective,
    description: content.summary,
    sections,
    metadata: {
      author: "StudyAI Academy",
      subject: content.title,
      keywords: content.concepts.map((concept) => concept.name),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

function createDefaultSlides(content: AcademyGeneratedContent): Slide[] {
  const slides: Slide[] = [
    {
      id: generateId(),
      layout: "cover",
      title: content.title,
      content: content.objective,
      presenterNotes: `Apresente o tema e o objetivo da aula sobre ${content.title}.`,
      order: 0,
    },
  ];

  content.chapters.forEach((chapter) => {
    slides.push({
      id: generateId(),
      layout: "title-content",
      title: chapter.title,
      content: chapter.content,
      presenterNotes: chapter.objective,
      order: slides.length,
    });
    if (chapter.examples.length) {
      slides.push({
        id: generateId(),
        layout: "title-content",
        title: `${chapter.title} — exemplos`,
        content: chapter.examples.map((example) => `- ${example}`).join("\n"),
        order: slides.length,
      });
    }
  });

  if (content.exercises.length) {
    slides.push({
      id: generateId(),
      layout: "exercise",
      title: "Exercícios",
      content: content.exercises.map((exercise, index) => `**${index + 1}. ${exercise.question}**\n\n${exercise.guidance ? `Dica: ${exercise.guidance}\n\n` : ""}Resposta: ${exercise.answer}`).join("\n\n"),
      order: slides.length,
    });
  }

  if (content.summary) {
    slides.push({
      id: generateId(),
      layout: "summary",
      title: "Resumo",
      content: content.summary,
      order: slides.length,
    });
  }

  return slides;
}

export const StudioService = {
  getDefaultEditorState(): StudioEditorState {
    return {
      activeDocumentId: undefined,
      activeSectionId: undefined,
      activeSlideId: undefined,
      viewMode: "split",
      sidebarOpen: true,
      sidebarTab: "structure",
      unsavedChanges: false,
      lastSavedAt: undefined,
    };
  },

  async createDocument(
    studyId: string,
    content: AcademyGeneratedContent,
    type: StudioDocumentType,
    templateId: StudioDocumentTemplate,
    kind: StudioContentKind = "study-material",
  ): Promise<StudioDocument> {
    const template = getTemplateById(templateId);
    if (!template) throw new Error("Template não encontrado.");

    const customization = template.defaultCustomization ?? createDefaultCustomization(templateId);
    const documentStructure = type === "document" ? createDefaultDocumentStructure(content) : undefined;
    const slides = type === "presentation" ? createDefaultSlides(content) : undefined;

    return StudioStorage.create({
      studyId,
      contentId: content.id,
      type,
      kind,
      title: content.title,
      template: templateId,
      customization,
      documentStructure,
      slides,
      status: "draft",
    });
  },

  async getDocument(id: string) {
    return StudioStorage.get(id);
  },

  async listDocuments(studyId?: string) {
    return StudioStorage.list(studyId);
  },

  async updateDocument(document: StudioDocument) {
    return StudioStorage.put(document);
  },

  async deleteDocument(id: string) {
    return StudioStorage.remove(id);
  },

  async duplicateDocument(id: string) {
    return StudioStorage.duplicate(id);
  },

  /** Autosave: grava a versão atual sem gerar cópias duplicadas. */
  async autosave(document: StudioDocument) {
    return StudioStorage.put(document);
  },

  // ---------------------------------------------------------------- Structure

  async addSection(documentId: string, section: Omit<DocumentSection, "id" | "order">, afterSectionId?: string) {
    const document = await this.getDocument(documentId);
    if (!document?.documentStructure) throw new Error("Documento não encontrado ou sem estrutura.");

    const newSection: DocumentSection = {
      ...section,
      id: generateId(),
      order: afterSectionId
        ? document.documentStructure.sections.findIndex((item) => item.id === afterSectionId) + 1
        : document.documentStructure.sections.length,
    };

    const sections = [...document.documentStructure.sections];
    if (afterSectionId) {
      const insertIndex = sections.findIndex((item) => item.id === afterSectionId) + 1;
      sections.splice(insertIndex, 0, newSection);
    } else {
      sections.push(newSection);
    }
    sections.forEach((item, index) => { item.order = index; });

    document.documentStructure = {
      ...document.documentStructure,
      sections,
      metadata: { ...document.documentStructure.metadata, updatedAt: new Date().toISOString() },
    };

    return this.updateDocument(document);
  },

  async removeSection(documentId: string, sectionId: string) {
    const document = await this.getDocument(documentId);
    if (!document?.documentStructure) throw new Error("Documento não encontrado.");

    document.documentStructure.sections = document.documentStructure.sections.filter((item) => item.id !== sectionId);
    document.documentStructure.sections.forEach((item, index) => { item.order = index; });
    document.documentStructure.metadata.updatedAt = new Date().toISOString();

    return this.updateDocument(document);
  },

  async updateSection(documentId: string, sectionId: string, updates: Partial<DocumentSection>) {
    const document = await this.getDocument(documentId);
    if (!document?.documentStructure) throw new Error("Documento não encontrado.");

    const index = document.documentStructure.sections.findIndex((item) => item.id === sectionId);
    if (index === -1) throw new Error("Seção não encontrada.");

    document.documentStructure.sections[index] = { ...document.documentStructure.sections[index], ...updates };
    document.documentStructure.metadata.updatedAt = new Date().toISOString();

    return this.updateDocument(document);
  },

  async updateStructure(documentId: string, updates: Partial<DocumentStructure>) {
    const document = await this.getDocument(documentId);
    if (!document?.documentStructure) throw new Error("Documento não encontrado.");

    document.documentStructure = {
      ...document.documentStructure,
      ...updates,
      metadata: { ...document.documentStructure.metadata, updatedAt: new Date().toISOString() },
    };

    return this.updateDocument(document);
  },

  async reorderSections(documentId: string, sectionIds: string[]) {
    const document = await this.getDocument(documentId);
    if (!document?.documentStructure) throw new Error("Documento não encontrado.");

    const sectionMap = new Map(document.documentStructure.sections.map((item) => [item.id, item]));
    const reordered = sectionIds.map((id, index) => {
      const section = sectionMap.get(id);
      if (!section) throw new Error(`Seção ${id} não encontrada.`);
      return { ...section, order: index };
    });

    document.documentStructure.sections = reordered;
    document.documentStructure.metadata.updatedAt = new Date().toISOString();

    return this.updateDocument(document);
  },

  // ------------------------------------------------------------------- Slides

  async addSlide(documentId: string, slide: Omit<Slide, "id" | "order">, afterSlideId?: string) {
    const document = await this.getDocument(documentId);
    if (!document?.slides) throw new Error("Documento não encontrado ou não é uma apresentação.");

    const newSlide: Slide = {
      ...slide,
      id: generateId(),
      order: afterSlideId
        ? document.slides.findIndex((item) => item.id === afterSlideId) + 1
        : document.slides.length,
    };

    const slides = [...document.slides];
    if (afterSlideId) {
      const insertIndex = slides.findIndex((item) => item.id === afterSlideId) + 1;
      slides.splice(insertIndex, 0, newSlide);
    } else {
      slides.push(newSlide);
    }
    slides.forEach((item, index) => { item.order = index; });

    document.slides = slides;
    document.updatedAt = new Date().toISOString();

    return this.updateDocument(document);
  },

  async removeSlide(documentId: string, slideId: string) {
    const document = await this.getDocument(documentId);
    if (!document?.slides) throw new Error("Documento não encontrado.");

    document.slides = document.slides.filter((item) => item.id !== slideId);
    document.slides.forEach((item, index) => { item.order = index; });
    document.updatedAt = new Date().toISOString();

    return this.updateDocument(document);
  },

  async updateSlide(documentId: string, slideId: string, updates: Partial<Slide>) {
    const document = await this.getDocument(documentId);
    if (!document?.slides) throw new Error("Documento não encontrado.");

    const index = document.slides.findIndex((item) => item.id === slideId);
    if (index === -1) throw new Error("Slide não encontrado.");

    document.slides[index] = { ...document.slides[index], ...updates };
    document.updatedAt = new Date().toISOString();

    return this.updateDocument(document);
  },

  async reorderSlides(documentId: string, slideIds: string[]) {
    const document = await this.getDocument(documentId);
    if (!document?.slides) throw new Error("Documento não encontrado.");

    const slideMap = new Map(document.slides.map((item) => [item.id, item]));
    const reordered = slideIds.map((id, index) => {
      const slide = slideMap.get(id);
      if (!slide) throw new Error(`Slide ${id} não encontrado.`);
      return { ...slide, order: index };
    });

    document.slides = reordered;
    document.updatedAt = new Date().toISOString();

    return this.updateDocument(document);
  },

  // ---------------------------------------------------- Template e estilo

  async changeTemplate(documentId: string, templateId: StudioDocumentTemplate) {
    const document = await this.getDocument(documentId);
    if (!document) throw new Error("Documento não encontrado.");

    const template = getTemplateById(templateId);
    if (!template) throw new Error("Template não encontrado.");

    document.template = templateId;
    document.customization = template.defaultCustomization ?? createDefaultCustomization(templateId);
    document.updatedAt = new Date().toISOString();

    return this.updateDocument(document);
  },

  /** Registra uma exportação no documento, sem duplicar registros. */
  async registerExport(documentId: string, record: StudioExportRecord) {
    const document = await this.getDocument(documentId);
    if (!document) throw new Error("Documento não encontrado.");

    document.exports = [record, ...(document.exports ?? []).filter((item) => item.id !== record.id)];
    document.status = "exported";

    return this.updateDocument(document);
  },

  async updateCustomization(documentId: string, customization: Partial<StudioCustomization>) {
    const document = await this.getDocument(documentId);
    if (!document) throw new Error("Documento não encontrado.");

    document.customization = { ...document.customization, ...customization };
    document.updatedAt = new Date().toISOString();

    return this.updateDocument(document);
  },

  /** Localiza o estudo dono de um documento do Studio. */
  async resolveStudy(document: StudioDocument): Promise<AcademyStudy | null> {
    const studies = await AcademyStorage.list();
    return studies.find((study) => study.id === document.studyId) ?? null;
  },
};

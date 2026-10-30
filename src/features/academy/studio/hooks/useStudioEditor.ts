"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type {
  StudioDocument,
  StudioEditorState,
  StudioDocumentType,
  StudioDocumentTemplate,
  StudioCustomization,
  StudioTemplate,
  StudioExportRecord,
  DocumentSection,
  DocumentStructure,
  Slide,
} from "../types";
import { StudioService } from "../service";
import { studioTemplates, getTemplateById, getTemplatesByType } from "../templates";
import type { AcademyGeneratedContent } from "../../types";

const AUTOSAVE_DELAY = 1_500;
const STORAGE_KEY = "studyai:studio-editor-state:v1";
const HISTORY_LIMIT = 40;

type HistoryEntry = {
  documentStructure?: StudioDocument["documentStructure"];
  slides?: StudioDocument["slides"];
};

export function useStudioEditor(initialDocument?: StudioDocument, initialContent?: AcademyGeneratedContent) {
  const [document, setDocument] = useState<StudioDocument | null>(initialDocument ?? null);
  const [content, setContent] = useState<AcademyGeneratedContent | null>(initialContent ?? null);
  const [editorState, setEditorState] = useState<StudioEditorState>(() => {
    if (typeof window === "undefined") return StudioService.getDefaultEditorState();
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<StudioEditorState>;
        return { ...StudioService.getDefaultEditorState(), ...parsed, unsavedChanges: false };
      }
    } catch {
      // ignore corrupted preferences
    }
    return StudioService.getDefaultEditorState();
  });
  const [availableTemplates, setAvailableTemplates] = useState<StudioTemplate[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    setAvailableTemplates(studioTemplates);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(editorState));
  }, [editorState]);

  useEffect(() => {
    if (document) setAvailableTemplates(getTemplatesByType(document.type));
  }, [document]);

  /** Registra um snapshot no histórico antes de uma mutação. */
  const pushHistory = useCallback((snapshot: HistoryEntry) => {
    historyRef.current = [...historyRef.current, snapshot].slice(-HISTORY_LIMIT);
    futureRef.current = [];
    setHistoryVersion((value) => value + 1);
  }, []);

  const snapshot = useCallback((): HistoryEntry => ({
    documentStructure: document?.documentStructure,
    slides: document?.slides,
  }), [document]);

  const applySnapshot = useCallback((entry: HistoryEntry) => {
    setDocument((current) => {
      if (!current) return current;
      return {
        ...current,
        documentStructure: entry.documentStructure,
        slides: entry.slides,
      };
    });
    setEditorState((state) => ({ ...state, unsavedChanges: true }));
  }, []);

  const undo = useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    futureRef.current = [snapshot(), ...futureRef.current].slice(0, HISTORY_LIMIT);
    applySnapshot(previous);
    setHistoryVersion((value) => value + 1);
  }, [applySnapshot, snapshot]);

  const redo = useCallback(() => {
    const next = futureRef.current.shift();
    if (!next) return;
    historyRef.current = [...historyRef.current, snapshot()].slice(-HISTORY_LIMIT);
    applySnapshot(next);
    setHistoryVersion((value) => value + 1);
  }, [applySnapshot, snapshot]);

  // Autosave com debounce
  useEffect(() => {
    if (!document || !editorState.unsavedChanges || isSaving) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      setIsSaving(true);
      void StudioService.autosave(document)
        .then((saved) => {
          setDocument(saved);
          setEditorState((state) => ({ ...state, unsavedChanges: false, lastSavedAt: new Date().toISOString() }));
        })
        .catch((error: unknown) => {
          setLastError(error instanceof Error ? error.message : "Não foi possível salvar automaticamente.");
        })
        .finally(() => setIsSaving(false));
    }, AUTOSAVE_DELAY);
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    };
  }, [document, editorState.unsavedChanges, isSaving]);

  const actions = useMemo(() => ({
    createNew: async (
      studyId: string,
      academyContent: AcademyGeneratedContent,
      type: StudioDocumentType,
      templateId: StudioDocumentTemplate,
      kind: "study-material" | "learning-path" | "practical-project" = "study-material",
    ) => {
      setIsLoading(true);
      setLastError(null);
      try {
        const created = await StudioService.createDocument(studyId, academyContent, type, templateId, kind);
        setDocument(created);
        setContent(academyContent);
        historyRef.current = [];
        futureRef.current = [];
        setHistoryVersion((value) => value + 1);
        setEditorState((state) => ({
          ...state,
          activeDocumentId: created.id,
          activeSectionId: created.documentStructure?.sections[0]?.id,
          activeSlideId: created.slides?.[0]?.id,
          unsavedChanges: false,
        }));
        return created;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível criar o documento.");
        return null;
      } finally {
        setIsLoading(false);
      }
    },

    loadDocument: async (documentId: string) => {
      setIsLoading(true);
      setLastError(null);
      try {
        const loaded = await StudioService.getDocument(documentId);
        if (!loaded) {
          setLastError("Documento não encontrado.");
          return null;
        }
        setDocument(loaded);
        historyRef.current = [];
        futureRef.current = [];
        setHistoryVersion((value) => value + 1);
        setEditorState((state) => ({
          ...state,
          activeDocumentId: loaded.id,
          activeSectionId: loaded.documentStructure?.sections[0]?.id,
          activeSlideId: loaded.slides?.[0]?.id,
          unsavedChanges: false,
        }));
        return loaded;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível abrir o documento.");
        return null;
      } finally {
        setIsLoading(false);
      }
    },

    saveDocument: async () => {
      if (!document) return null;
      setIsSaving(true);
      try {
        const saved = await StudioService.updateDocument(document);
        setDocument(saved);
        setEditorState((state) => ({ ...state, unsavedChanges: false, lastSavedAt: new Date().toISOString() }));
        return saved;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível salvar.");
        return null;
      } finally {
        setIsSaving(false);
      }
    },

    duplicateDocument: async () => {
      if (!document) return null;
      setIsLoading(true);
      try {
        const duplicated = await StudioService.duplicateDocument(document.id);
        setDocument(duplicated);
        setEditorState((state) => ({ ...state, activeDocumentId: duplicated.id, unsavedChanges: false }));
        return duplicated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível duplicar.");
        return null;
      } finally {
        setIsLoading(false);
      }
    },

    deleteDocument: async () => {
      if (!document) return;
      setIsLoading(true);
      try {
        await StudioService.deleteDocument(document.id);
        setDocument(null);
        setEditorState((state) => ({ ...state, activeDocumentId: undefined, activeSectionId: undefined, activeSlideId: undefined }));
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível excluir.");
      } finally {
        setIsLoading(false);
      }
    },

    addSection: async (section: Omit<DocumentSection, "id" | "order">, afterSectionId?: string) => {
      if (!document) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.addSection(document.id, section, afterSectionId);
        setDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível adicionar a seção.");
        return null;
      }
    },

    removeSection: async (sectionId: string) => {
      if (!document) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.removeSection(document.id, sectionId);
        setDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true, activeSectionId: undefined }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível remover a seção.");
        return null;
      }
    },

    updateSection: async (sectionId: string, updates: Partial<DocumentSection>) => {
      if (!document) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.updateSection(document.id, sectionId, updates);
        setDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível atualizar a seção.");
        return null;
      }
    },

    updateStructure: async (updates: Partial<DocumentStructure>) => {
      if (!document) return null;
      try {
        const updated = await StudioService.updateStructure(document.id, updates);
        setDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível atualizar o documento.");
        return null;
      }
    },

    duplicateSection: async (sectionId: string) => {
      if (!document?.documentStructure) return null;
      const source = document.documentStructure.sections.find((section) => section.id === sectionId);
      if (!source) return null;
      return actions.addSection(
        { type: source.type, title: source.title, content: source.content, level: source.level, metadata: source.metadata },
        sectionId,
      );
    },

    reorderSections: async (sectionIds: string[]) => {
      if (!document) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.reorderSections(document.id, sectionIds);
        setDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível reordenar as seções.");
        return null;
      }
    },

    addSlide: async (slide: Omit<Slide, "id" | "order">, afterSlideId?: string) => {
      if (!document) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.addSlide(document.id, slide, afterSlideId);
        setDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível adicionar o slide.");
        return null;
      }
    },

    removeSlide: async (slideId: string) => {
      if (!document) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.removeSlide(document.id, slideId);
        setDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true, activeSlideId: undefined }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível remover o slide.");
        return null;
      }
    },

    updateSlide: async (slideId: string, updates: Partial<Slide>) => {
      if (!document) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.updateSlide(document.id, slideId, updates);
        setDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível atualizar o slide.");
        return null;
      }
    },

    duplicateSlide: async (slideId: string) => {
      if (!document?.slides) return null;
      const source = document.slides.find((slide) => slide.id === slideId);
      if (!source) return null;
      return actions.addSlide(
        {
          layout: source.layout,
          title: source.title,
          content: source.content,
          presenterNotes: source.presenterNotes,
          background: source.background,
          customFields: source.customFields,
        },
        slideId,
      );
    },

    reorderSlides: async (slideIds: string[]) => {
      if (!document) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.reorderSlides(document.id, slideIds);
        setDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível reordenar os slides.");
        return null;
      }
    },

    changeTemplate: async (templateId: StudioDocumentTemplate) => {
      if (!document) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.changeTemplate(document.id, templateId);
        setDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível alterar o template.");
        return null;
      }
    },

    registerExport: async (record: StudioExportRecord) => {
      if (!document) return null;
      try {
        const updated = await StudioService.registerExport(document.id, record);
        setDocument(updated);
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível registrar a exportação.");
        return null;
      }
    },

    updateCustomization: async (customization: Partial<StudioCustomization>) => {
      if (!document) return null;
      try {
        const updated = await StudioService.updateCustomization(document.id, customization);
        setDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível atualizar a personalização.");
        return null;
      }
    },

    undo,
    redo,

    setViewMode: (mode: "edit" | "preview" | "split") => {
      setEditorState((state) => ({ ...state, viewMode: mode }));
    },
    toggleSidebar: () => {
      setEditorState((state) => ({ ...state, sidebarOpen: !state.sidebarOpen }));
    },
    setSidebarTab: (tab: StudioEditorState["sidebarTab"]) => {
      setEditorState((state) => ({ ...state, sidebarTab: tab }));
    },
    setActiveSection: (sectionId?: string) => {
      setEditorState((state) => ({ ...state, activeSectionId: sectionId }));
    },
    setActiveSlide: (slideId?: string) => {
      setEditorState((state) => ({ ...state, activeSlideId: slideId }));
    },
    markUnsaved: () => {
      setEditorState((state) => ({ ...state, unsavedChanges: true }));
    },
    clearError: () => setLastError(null),
  }), [document, pushHistory, snapshot, undo, redo]);

  return {
    document,
    content,
    editorState,
    availableTemplates,
    isSaving,
    lastError,
    isLoading,
    canUndo: historyRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    historyVersion,
    ...actions,
    getActiveSection: () => document?.documentStructure?.sections.find((section) => section.id === editorState.activeSectionId),
    getActiveSlide: () => document?.slides?.find((slide) => slide.id === editorState.activeSlideId),
    getTemplate: () => (document ? getTemplateById(document.template) : undefined),
  };
}

"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type {
  StudioDocument,
  StudioEditorState,
  StudioDocumentType,
  StudioDocumentTemplate,
  StudioPedagogicalTemplate,
  StudioPedagogicalTemplateId,
  StudioCustomization,
  StudioTemplate,
  StudioExportRecord,
  DocumentSection,
  DocumentStructure,
  Slide,
} from "../types";
import { StudioService } from "../service";
import { studioTemplates, studioPedagogicalTemplates, getTemplateById, getTemplatesByType } from "../templates";
import type { AcademyGeneratedContent, AcademyStudy } from "../../types";

const AUTOSAVE_DELAY = 1_500;
const STORAGE_KEY = "studyai:studio-editor-state:v1";
const HISTORY_LIMIT = 40;

type HistoryEntry = {
  title?: string;
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
  const [availablePedagogicalTemplates] = useState<StudioPedagogicalTemplate[]>(studioPedagogicalTemplates);
  const [isSaving, setIsSaving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const documentRef = useRef<StudioDocument | null>(document);
  documentRef.current = document;
  const editorStateRef = useRef(editorState);
  editorStateRef.current = editorState;
  const lastErrorRef = useRef(lastError);
  lastErrorRef.current = lastError;
  const mutationQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const commitDocument = useCallback((nextDoc: StudioDocument | null) => {
    documentRef.current = nextDoc;
    setDocument(nextDoc);
  }, []);

  /** Serializa mutações da mesma aba para evitar falsos conflitos de versão. */
  const enqueueMutation = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = mutationQueueRef.current.catch(() => undefined).then(task);
    mutationQueueRef.current = run.catch(() => undefined);
    return run;
  }, []);

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

  const snapshot = useCallback((): HistoryEntry => {
    const current = documentRef.current;
    return {
      title: current?.title,
      documentStructure: current?.documentStructure,
      slides: current?.slides,
    };
  }, []);

  const applySnapshot = useCallback((entry: HistoryEntry) => {
    const current = documentRef.current;
    if (!current) return;
    commitDocument({
      ...current,
      title: entry.title ?? current.title,
      documentStructure: entry.documentStructure,
      slides: entry.slides,
    });
    setEditorState((state) => ({ ...state, unsavedChanges: true }));
  }, [commitDocument]);

  const undo = useCallback(() => {
    void enqueueMutation(async () => {
      const previous = historyRef.current.pop();
      if (!previous) return;
      futureRef.current = [snapshot(), ...futureRef.current].slice(0, HISTORY_LIMIT);
      applySnapshot(previous);
      setHistoryVersion((value) => value + 1);
    });
  }, [applySnapshot, enqueueMutation, snapshot]);

  const redo = useCallback(() => {
    void enqueueMutation(async () => {
      const next = futureRef.current.shift();
      if (!next) return;
      historyRef.current = [...historyRef.current, snapshot()].slice(-HISTORY_LIMIT);
      applySnapshot(next);
      setHistoryVersion((value) => value + 1);
    });
  }, [applySnapshot, enqueueMutation, snapshot]);

  // Autosave com debounce
  useEffect(() => {
    if (!document || !editorState.unsavedChanges || isSaving || lastError) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      void enqueueMutation(async () => {
        const current = documentRef.current;
        if (!current || !editorStateRef.current.unsavedChanges || lastErrorRef.current) return;
        setIsSaving(true);
        try {
          const saved = await StudioService.autosave(current);
          commitDocument(saved);
          setEditorState((state) => ({ ...state, unsavedChanges: false, lastSavedAt: new Date().toISOString() }));
        } catch (error) {
          setLastError(error instanceof Error ? error.message : "Não foi possível salvar automaticamente.");
        } finally {
          setIsSaving(false);
        }
      });
    }, AUTOSAVE_DELAY);
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    };
  }, [commitDocument, document, editorState.unsavedChanges, enqueueMutation, isSaving, lastError]);

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
        commitDocument(created);
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

    createManual: async (
      study: Pick<AcademyStudy, "id" | "title" | "topic" | "subject">,
      type: StudioDocumentType = "document",
      pedagogicalTemplateId: StudioPedagogicalTemplateId = "structured-lesson",
      visualTemplateId?: StudioDocumentTemplate,
    ) => {
      setIsLoading(true);
      setLastError(null);
      try {
        const created = await StudioService.createManualDocument(study, type, pedagogicalTemplateId, visualTemplateId);
        commitDocument(created);
        setContent(null);
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
        setLastError(error instanceof Error ? error.message : "Não foi possível criar o documento manual.");
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
        commitDocument(loaded);
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

    saveDocument: async () => enqueueMutation(async () => {
      const current = documentRef.current;
      if (!current) return null;
      if (autosaveRef.current) {
        clearTimeout(autosaveRef.current);
        autosaveRef.current = null;
      }
      setLastError(null);
      setIsSaving(true);
      try {
        const saved = await StudioService.updateDocument(current);
        commitDocument(saved);
        setEditorState((state) => ({ ...state, unsavedChanges: false, lastSavedAt: new Date().toISOString() }));
        return saved;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível salvar.");
        return null;
      } finally {
        setIsSaving(false);
      }
    }),

    prepareForExport: async () => enqueueMutation(async () => {
      const current = documentRef.current;
      if (!current) return null;
      if (autosaveRef.current) {
        clearTimeout(autosaveRef.current);
        autosaveRef.current = null;
      }
      if (!editorStateRef.current.unsavedChanges) return current;
      setLastError(null);
      setIsSaving(true);
      try {
        const saved = await StudioService.autosave(current);
        commitDocument(saved);
        setEditorState((state) => ({ ...state, unsavedChanges: false, lastSavedAt: new Date().toISOString() }));
        return saved;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível salvar antes da exportação.");
        return current;
      } finally {
        setIsSaving(false);
      }
    }),

    duplicateDocument: async () => {
      const current = documentRef.current;
      if (!current) return null;
      setIsLoading(true);
      try {
        const duplicated = await StudioService.duplicateDocument(current.id);
        commitDocument(duplicated);
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
      const current = documentRef.current;
      if (!current) return;
      setIsLoading(true);
      try {
        await StudioService.deleteDocument(current.id);
        commitDocument(null);
        setEditorState((state) => ({ ...state, activeDocumentId: undefined, activeSectionId: undefined, activeSlideId: undefined }));
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível excluir.");
      } finally {
        setIsLoading(false);
      }
    },

    addSection: async (section: Omit<DocumentSection, "id" | "order">, afterSectionId?: string) => enqueueMutation(async () => {
      const current = documentRef.current;
      if (!current) return null;
      const beforeIds = new Set(current.documentStructure?.sections.map((item) => item.id) ?? []);
      pushHistory(snapshot());
      try {
        const updated = await StudioService.addSection(current.id, section, afterSectionId);
        const created = updated.documentStructure?.sections.find((item) => !beforeIds.has(item.id));
        commitDocument(updated);
        setEditorState((state) => ({
          ...state,
          unsavedChanges: true,
          activeSectionId: created?.id ?? state.activeSectionId,
        }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível adicionar a seção.");
        return null;
      }
    }),

    removeSection: async (sectionId: string) => enqueueMutation(async () => {
      const current = documentRef.current;
      if (!current) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.removeSection(current.id, sectionId);
        commitDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true, activeSectionId: undefined }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível remover a seção.");
        return null;
      }
    }),

    updateSection: async (sectionId: string, updates: Partial<DocumentSection>) => enqueueMutation(async () => {
      const current = documentRef.current;
      if (!current) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.updateSection(current.id, sectionId, updates, current.version);
        commitDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível atualizar a seção.");
        return null;
      }
    }),

    updateStructure: async (updates: Partial<DocumentStructure>) => enqueueMutation(async () => {
      const current = documentRef.current;
      if (!current) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.updateStructure(current.id, updates);
        commitDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível atualizar o documento.");
        return null;
      }
    }),

    duplicateSection: async (sectionId: string) => {
      const current = documentRef.current;
      if (!current?.documentStructure) return null;
      const source = current.documentStructure.sections.find((section) => section.id === sectionId);
      if (!source) return null;
      return actions.addSection(
        { type: source.type, title: source.title, content: source.content, level: source.level, metadata: source.metadata },
        sectionId,
      );
    },

    reorderSections: async (sectionIds: string[]) => enqueueMutation(async () => {
      const current = documentRef.current;
      if (!current) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.reorderSections(current.id, sectionIds);
        commitDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível reordenar as seções.");
        return null;
      }
    }),

    addSlide: async (slide: Omit<Slide, "id" | "order">, afterSlideId?: string) => enqueueMutation(async () => {
      const current = documentRef.current;
      if (!current) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.addSlide(current.id, slide, afterSlideId);
        commitDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível adicionar o slide.");
        return null;
      }
    }),

    removeSlide: async (slideId: string) => enqueueMutation(async () => {
      const current = documentRef.current;
      if (!current) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.removeSlide(current.id, slideId);
        commitDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true, activeSlideId: undefined }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível remover o slide.");
        return null;
      }
    }),

    updateSlide: async (slideId: string, updates: Partial<Slide>) => enqueueMutation(async () => {
      const current = documentRef.current;
      if (!current) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.updateSlide(current.id, slideId, updates);
        commitDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível atualizar o slide.");
        return null;
      }
    }),

    duplicateSlide: async (slideId: string) => {
      const current = documentRef.current;
      if (!current?.slides) return null;
      const source = current.slides.find((slide) => slide.id === slideId);
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

    reorderSlides: async (slideIds: string[]) => enqueueMutation(async () => {
      const current = documentRef.current;
      if (!current) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.reorderSlides(current.id, slideIds);
        commitDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível reordenar os slides.");
        return null;
      }
    }),

    changeTemplate: async (templateId: StudioDocumentTemplate) => enqueueMutation(async () => {
      const current = documentRef.current;
      if (!current) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.changeTemplate(current.id, templateId);
        commitDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível alterar o template.");
        return null;
      }
    }),

    applyPedagogicalTemplate: async (
      pedagogicalTemplateId: StudioPedagogicalTemplateId,
      context?: { title?: string; topic?: string; subject?: string },
    ) => enqueueMutation(async () => {
      const current = documentRef.current;
      if (!current) return null;
      pushHistory(snapshot());
      try {
        const updated = await StudioService.applyPedagogicalTemplate(current.id, pedagogicalTemplateId, context);
        commitDocument(updated);
        setEditorState((state) => ({
          ...state,
          activeSectionId: updated.documentStructure?.sections[0]?.id,
          activeSlideId: updated.slides?.[0]?.id,
          unsavedChanges: true,
        }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível aplicar o template pedagógico.");
        return null;
      }
    }),

    registerExport: async (record: StudioExportRecord) => enqueueMutation(async () => {
      const current = documentRef.current;
      if (!current) return null;
      try {
        const updated = await StudioService.registerExport(current.id, record);
        commitDocument(updated);
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível registrar a exportação.");
        return null;
      }
    }),

    updateCustomization: async (customization: Partial<StudioCustomization>) => enqueueMutation(async () => {
      const current = documentRef.current;
      if (!current) return null;
      try {
        const updated = await StudioService.updateCustomization(current.id, customization);
        commitDocument(updated);
        setEditorState((state) => ({ ...state, unsavedChanges: true }));
        return updated;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Não foi possível atualizar a personalização.");
        return null;
      }
    }),

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
  }), [commitDocument, enqueueMutation, pushHistory, snapshot, undo, redo]);

  return {
    document,
    content,
    editorState,
    availableTemplates,
    availablePedagogicalTemplates,
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

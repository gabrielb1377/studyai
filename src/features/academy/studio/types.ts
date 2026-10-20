export type StudioDocumentType = "document" | "presentation";

export type StudioContentKind = "study-material" | "learning-path" | "practical-project";

export type StudioDocumentTemplate = 
  | "academic" 
  | "modern" 
  | "minimalist" 
  | "technical" 
  | "workbook" 
  | "ebook"
  | "academic-presentation"
  | "professional-presentation"
  | "modern-presentation"
  | "minimalist-presentation"
  | "tech-presentation"
  | "education-presentation";

export type StudioColorScheme = "default" | "blue" | "green" | "purple" | "orange" | "teal" | "rose";

export type StudioFontFamily = "aptos" | "inter" | "roboto" | "source-serif" | "ibm-plex" | "noto-serif";

export type StudioFontSize = "small" | "medium" | "large" | "xlarge";

export type StudioSpacing = "compact" | "normal" | "relaxed";

export type StudioOrientation = "portrait" | "landscape";

export type StudioPageNumbering = "none" | "bottom-center" | "bottom-right" | "top-right";

export type SlideLayoutType = 
  | "cover" 
  | "title-content" 
  | "two-column" 
  | "comparison" 
  | "image-text" 
  | "diagram" 
  | "code" 
  | "exercise" 
  | "summary" 
  | "blank";

export type SlideLayout = {
  type: SlideLayoutType;
  title: string;
  content: string[];
  placeholder?: {
    type: "image" | "chart" | "table" | "diagram" | "code";
    description?: string;
  }[];
};

export type Slide = {
  id: string;
  layout: SlideLayoutType;
  title: string;
  content: string;
  presenterNotes?: string;
  order: number;
  background?: string;
  customFields?: Record<string, string>;
};

export type DocumentSection = {
  id: string;
  type: "heading" | "paragraph" | "list" | "code" | "table" | "example" | "exercise" | "summary" | "diagram" | "blockquote";
  title?: string;
  content: string;
  level?: 1 | 2 | 3;
  order: number;
  metadata?: {
    language?: string;
    columns?: number;
    rows?: number;
    caption?: string;
  };
};

export type DocumentStructure = {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  sections: DocumentSection[];
  metadata: {
    author?: string;
    subject?: string;
    keywords?: string[];
    createdAt: string;
    updatedAt: string;
  };
};

export type StudioCustomization = {
  template: StudioDocumentTemplate;
  colorScheme: StudioColorScheme;
  fontFamily: StudioFontFamily;
  fontSize: StudioFontSize;
  spacing: StudioSpacing;
  orientation: StudioOrientation;
  pageNumbering: StudioPageNumbering;
  headerFooter: {
    enabled: boolean;
    headerText?: string;
    footerText?: string;
    showPageNumbers: boolean;
  };
  coverPage: {
    enabled: boolean;
    title?: string;
    subtitle?: string;
    author?: string;
    date?: string;
    logo?: string;
  };
  tableOfContents: {
    enabled: boolean;
    depth: 1 | 2 | 3;
  };
};

export type StudioDocument = {
  id: string;
  studyId: string;
  contentId?: string;
  type: StudioDocumentType;
  kind: StudioContentKind;
  title: string;
  template: StudioDocumentTemplate;
  customization: StudioCustomization;
  documentStructure?: DocumentStructure;
  slides?: Slide[];
  version: number;
  status: "draft" | "ready" | "exported";
  createdAt: string;
  updatedAt: string;
  lastEditedBy?: string;
};

export type StudioEditorState = {
  activeDocumentId?: string;
  activeSectionId?: string;
  activeSlideId?: string;
  viewMode: "edit" | "preview" | "split";
  sidebarOpen: boolean;
  sidebarTab: "structure" | "templates" | "customization" | "ai-assist";
  unsavedChanges: boolean;
  lastSavedAt?: string;
};

export type AIAssistAction = 
  | "improve-writing"
  | "summarize"
  | "expand"
  | "create-example"
  | "create-exercise"
  | "simplify"
  | "reorganize"
  | "translate"
  | "create-summary"
  | "create-flashcards"
  | "create-quiz";

export type AIAssistContext = {
  documentId: string;
  sectionId?: string;
  slideId?: string;
  selectedText?: string;
  action: AIAssistAction;
  context?: string;
};

export type AIAssistResult = {
  originalText: string;
  suggestedText: string;
  explanation: string;
  action: AIAssistAction;
};

export type StudioTemplate = {
  id: StudioDocumentTemplate;
  name: string;
  description: string;
  type: StudioDocumentType;
  previewImage?: string;
  tags: string[];
  defaultCustomization: StudioCustomization;
  defaultStructure?: Partial<DocumentStructure>;
  defaultSlides?: Partial<Slide>[];
};
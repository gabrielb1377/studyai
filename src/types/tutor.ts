export type TutorConversation = {
  discipline?: import("@/features/tutor/services/DisciplineContext").DisciplineSelection;
  id: string;
  title: string;
  messages: TutorMessage[];
  createdAt: string;
  updatedAt: string;
};

export type TutorCodeBlock = {
  language: string;
  code: string;
};

export type TutorTable = {
  headers: string[];
  rows: string[][];
};

export type TutorMessage = {
  sources?: Array<{ id: string; name: string; page?: number; excerpt: string }>;
  id: string;
  role: "assistant" | "user";
  content: string;
  heading?: string;
  list?: string[];
  code?: TutorCodeBlock;
  table?: TutorTable;
  metadata?: {
    provider?: string;
    model?: string;
    cached?: boolean;
    fallbackUsed?: boolean;
    estimated?: boolean;
    inputTokens?: number;
    outputTokens?: number;
    contextTokens?: number;
    historyTokens?: number;
    chunkTokens?: number;
    routingSelection?: "manual" | "automatic";
    routingReason?: string;
    maxOutputTokens?: number;
    contextLimited?: boolean;
  };
};

export type TutorConversation = {
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
  id: string;
  role: "assistant" | "user";
  content: string;
  heading?: string;
  list?: string[];
  code?: TutorCodeBlock;
  table?: TutorTable;
};

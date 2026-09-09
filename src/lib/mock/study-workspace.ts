import type { StudyMaterial, StudyMessage, StudyTool } from "@/types/study";

export const studyMaterials: readonly StudyMaterial[] = [
  {
    id: "material-pdf",
    name: "Introdução aos vetores.pdf",
    type: "pdf",
    label: "PDF",
    size: "2,4 MB",
    source:
      "data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0OSA+PgpzdHJlYW0KQlQKL0YxIDI0IFRmCjcyIDcyMCBUZAooTW9jayBTdHVkeUFJIFBERikgVGoKRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzMzggMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MDgKJSVFT0YK",
  },
  {
    id: "material-video",
    name: "Vetores e matrizes — Aula 03.mp4",
    type: "video",
    label: "Vídeo",
    size: "184 MB",
    source: undefined,
  },
  {
    id: "material-audio",
    name: "Revisão da aula.mp3",
    type: "audio",
    label: "Áudio",
    size: "12,8 MB",
    source: undefined,
  },
  {
    id: "material-txt",
    name: "Resumo da aula.txt",
    type: "txt",
    label: "TXT",
    size: "18 KB",
    textContent:
      "Vetores e matrizes\n\nUm vetor é uma estrutura linear que armazena elementos em sequência.\n\nPontos para revisar:\n- Índices começam em zero em muitas linguagens.\n- Matrizes organizam valores em linhas e colunas.\n- O acesso por índice é rápido e previsível.",
  },
];

export const initialStudyMessages: readonly StudyMessage[] = [
  {
    id: "assistant-welcome",
    role: "assistant",
    content:
      "Olá! Estou pronto para ajudar você a explorar Vetores e matrizes. Esta é uma prévia visual do tutor.",
  },
  {
    id: "user-question",
    role: "user",
    content: "Por onde eu posso começar?",
  },
  {
    id: "assistant-answer",
    role: "assistant",
    content:
      "Comece entendendo como um vetor armazena valores em sequência e, depois, avance para matrizes.",
  },
];

export const studyTools: readonly StudyTool[] = [
  {
    id: "flashcards",
    title: "Flashcards",
    description: "Revise conceitos-chave no seu ritmo.",
  },
  {
    id: "quiz",
    title: "Quiz",
    description: "Pratique com perguntas sobre este tema.",
  },
  {
    id: "notes",
    title: "Notas",
    description: "Registre os pontos mais importantes.",
  },
];

import type { StudyMaterial, StudyMessage, StudyTool } from "@/types/study";

export const studyMaterials: readonly StudyMaterial[] = [
  {
    id: "material-pdf",
    name: "Introdução aos vetores.pdf",
    type: "pdf",
    label: "PDF",
    size: "2,4 MB",
  },
  {
    id: "material-video",
    name: "Vetores e matrizes — Aula 03.mp4",
    type: "video",
    label: "Vídeo",
    size: "184 MB",
  },
  {
    id: "material-audio",
    name: "Revisão da aula.mp3",
    type: "audio",
    label: "Áudio",
    size: "12,8 MB",
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

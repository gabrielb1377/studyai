import type { TutorConversation, TutorMessage } from "@/types/tutor";

const algorithmsMessages: TutorMessage[] = [
  {
    id: "tutor-welcome",
    role: "assistant",
    heading: "Vetores e matrizes",
    content: "Vamos organizar os conceitos essenciais para você começar com segurança.",
    list: [
      "Vetores armazenam dados em sequência.",
      "Cada elemento é acessado pelo seu índice.",
      "Matrizes organizam valores em linhas e colunas.",
    ],
  },
  {
    id: "user-example",
    role: "user",
    content: "Você pode mostrar um exemplo simples em Java?",
  },
  {
    id: "tutor-example",
    role: "assistant",
    content: "Claro. Este trecho cria um vetor e acessa seu primeiro valor:",
    code: {
      language: "Java",
      code: "int[] notas = {8, 9, 7};\nSystem.out.println(notas[0]); // 8",
    },
    table: {
      headers: ["Índice", "Valor"],
      rows: [["0", "8"], ["1", "9"], ["2", "7"]],
    },
  },
];

const mockDate = "2026-09-09T12:00:00.000Z";

export const tutorConversations: readonly TutorConversation[] = [
  {
    id: "algorithms",
    title: "Algoritmos",
    messages: algorithmsMessages,
    createdAt: mockDate,
    updatedAt: mockDate,
  },
  {
    id: "database",
    title: "Banco de Dados",
    messages: [{ id: "database-welcome", role: "assistant", content: "Vamos revisar os fundamentos de Banco de Dados." }],
    createdAt: "2026-09-08T12:00:00.000Z",
    updatedAt: "2026-09-08T12:00:00.000Z",
  },
  {
    id: "java",
    title: "Java",
    messages: [{ id: "java-welcome", role: "assistant", content: "Podemos explorar classes e objetos em Java." }],
    createdAt: "2026-09-07T12:00:00.000Z",
    updatedAt: "2026-09-07T12:00:00.000Z",
  },
  {
    id: "math",
    title: "Matemática",
    messages: [{ id: "math-welcome", role: "assistant", content: "Vamos estudar lógica proposicional." }],
    createdAt: "2026-09-06T12:00:00.000Z",
    updatedAt: "2026-09-06T12:00:00.000Z",
  },
];

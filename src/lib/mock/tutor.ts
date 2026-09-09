import type { TutorConversation, TutorMessage } from "@/types/tutor";

export const tutorConversations: readonly TutorConversation[] = [
  { id: "algorithms", title: "Algoritmos", preview: "Vetores e matrizes", updatedAt: "Agora" },
  { id: "database", title: "Banco de Dados", preview: "Modelo entidade-relacionamento", updatedAt: "Ontem" },
  { id: "java", title: "Java", preview: "Classes e objetos", updatedAt: "Segunda" },
  { id: "math", title: "Matemática", preview: "Lógica proposicional", updatedAt: "Sexta" },
];

export const tutorMessages: readonly TutorMessage[] = [
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

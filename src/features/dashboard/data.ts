import type { Topic } from "@/types/study";

export const topics: Topic[] = [
  {
    id: "vetores",
    title: "Vetores e matrizes",
    subject: "Algoritmos",
    description:
      "Um passo de cada vez. Continue explorando como organizar e trabalhar com dados.",
    progress: 65,
    lastStudied: "Há 2 horas",
  },
  {
    id: "modelagem",
    title: "Modelagem de dados",
    subject: "Banco de dados",
    description:
      "Entidades, atributos e relações: a base de um bom banco de dados.",
    progress: 30,
    lastStudied: "Ontem",
  },
  {
    id: "logica",
    title: "Lógica proposicional",
    subject: "Matemática discreta",
    description: "Conectivos e proposições para construir um raciocínio claro.",
    progress: 45,
    lastStudied: "Há 2 dias",
  },
];

export const weeklyProgress = [
  { day: "Seg", minutes: 35 },
  { day: "Ter", minutes: 55 },
  { day: "Qua", minutes: 25 },
  { day: "Qui", minutes: 45 },
  { day: "Sex", minutes: 20 },
  { day: "Sáb", minutes: 0 },
  { day: "Dom", minutes: 0 },
];

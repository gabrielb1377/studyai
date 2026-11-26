/**
 * StudyAI — Intelligence Engine (IE-4C)
 * Fixtures sintéticas e determinísticas (data fixa: 2026-11-26T12:00:00.000Z) para:
 * - practice.adaptive (0.1.0)
 * - exam.preparation (0.1.0)
 * - gap.detection (0.1.0)
 */

import type { PracticeAdaptiveOutput } from "../practiceAdaptive";
import type { ExamPreparationOutput } from "../examPreparation";
import type { GapDetectionOutput } from "../gapDetection";

export const IE4C_FIXED_DATE = "2026-11-26T12:00:00.000Z";

export const PRACTICE_ADAPTIVE_FIXTURES = {
  beginnerValid: {
    inputs: { studyId: "study-ed", topic: "Listas Ligadas", count: 2 },
    simulatedOutput: JSON.stringify({
      targetDifficulty: "easy",
      hasHistory: true,
      exercises: [
        {
          id: "pa-easy-1",
          prompt: "Em uma lista simplesmente encadeada, o que cada nó armazena além do dado?",
          difficulty: "easy",
          expectedAnswer: "Uma referência (ponteiro) para o próximo nó da lista.",
          gradingCriteria: "Deve mencionar o ponteiro/referência ao próximo nó.",
          revealAnswerBeforeAttempt: false,
          sourceRef: "Estruturas de Dados · p. 12",
        },
      ],
      progressionNote: "Dificuldade 'easy' alinhada ao AdaptiveAssessmentEngine para consolidar fundamentos.",
    } satisfies PracticeAdaptiveOutput),
  },

  advancedValid: {
    inputs: { studyId: "study-ed", topic: "Árvores Balanceadas", count: 2 },
    simulatedOutput: JSON.stringify({
      targetDifficulty: "hard",
      hasHistory: true,
      exercises: [
        {
          id: "pa-hard-1",
          prompt: "Compare o número máximo de rotações após uma remoção em uma árvore AVL versus uma árvore Rubro-Negra.",
          difficulty: "hard",
          expectedAnswer: "AVL pode exigir O(log n) rotações na remoção; Rubro-Negra exige no máximo O(1) rotações (até 3).",
          gradingCriteria: "Deve distinguir O(log n) em AVL de O(1) rotações em Rubro-Negra.",
          revealAnswerBeforeAttempt: false,
          sourceRef: "Estruturas de Dados · p. 64",
        },
      ],
      progressionNote: "Dificuldade 'hard' mantida pelo bom histórico de acertos.",
    } satisfies PracticeAdaptiveOutput),
  },

  incompatibleDifficultyAndEarlyReveal: {
    inputs: { studyId: "study-ed", topic: "Listas Ligadas" },
    rawInvalid: JSON.stringify({
      targetDifficulty: "hard", // divergente do snapshot 'easy'
      hasHistory: true,
      exercises: [
        {
          id: "pa-bad-1",
          prompt: "Pergunta difícil demais",
          difficulty: "hard",
          expectedAnswer: "Resposta",
          gradingCriteria: "Critério",
          revealAnswerBeforeAttempt: true, // violação!
        },
      ],
      progressionNote: "Nota.",
    }),
  },
};

export const EXAM_PREPARATION_FIXTURES = {
  validPreparation: {
    inputs: {
      examTitle: "P1 — Estruturas de Dados",
      examDate: "2026-12-01",
      dailyMinutes: 60,
      referenceDate: IE4C_FIXED_DATE,
    },
    simulatedOutput: JSON.stringify({
      examTitle: "P1 — Estruturas de Dados",
      examDate: "2026-12-01",
      daysLeft: 5,
      dailyMinutesLimit: 60,
      studySchedule: [
        {
          dayOffset: 0,
          dateStr: "2026-11-26",
          subject: "Árvores Binárias",
          minutes: 35,
          priority: "high",
          source: "engine",
          focus: "Revisar inserção, busca e remoção em ABB.",
        },
        {
          dayOffset: 0,
          dateStr: "2026-11-26",
          subject: "Tabelas Hash",
          minutes: 25,
          priority: "medium",
          source: "suggestion",
          focus: "Revisar tratamento de colisões por encadeamento.",
        },
      ],
      mockQuestions: [
        {
          id: "ep-mq-1",
          prompt: "Explique por que o encadeamento separado degrada para O(n) quando todas as chaves colidem no mesmo bucket.",
          expectedAnswer: "Porque a busca percorre linearmente a lista encadeada do bucket.",
          gradingCriteria: "Deve citar percurso linear na lista do bucket e complexidade O(n).",
          generatedByAI: true,
        },
      ],
      readinessCriteria: [
        "Resolver todas as questões do simulado com >= 80% de acerto sem consulta.",
      ],
    } satisfies ExamPreparationOutput),
  },

  exceedsTimeAndFakeOfficialQuestion: {
    inputs: {
      examTitle: "P1 — Estruturas de Dados",
      examDate: "2026-12-01",
      dailyMinutes: 45,
      referenceDate: IE4C_FIXED_DATE,
    },
    rawInvalid: JSON.stringify({
      examTitle: "P1 — Estruturas de Dados",
      examDate: "2026-12-01",
      daysLeft: 5,
      dailyMinutesLimit: 45,
      studySchedule: [
        {
          dayOffset: 0,
          dateStr: "2026-11-26",
          subject: "Árvores Binárias",
          minutes: 60, // > 45!
          priority: "high",
          source: "engine",
          focus: "Excede tempo autorizado.",
        },
      ],
      mockQuestions: [
        {
          id: "ep-mq-bad",
          prompt: "Questão inventada como se fosse oficial.",
          expectedAnswer: "Resposta",
          gradingCriteria: "Critério",
          generatedByAI: false, // violação!
        },
      ],
      readinessCriteria: ["Critério."],
    }),
  },
};

export const GAP_DETECTION_FIXTURES = {
  noHistoryValid: {
    inputs: { referenceDate: IE4C_FIXED_DATE },
    simulatedOutput: JSON.stringify({
      hasHistory: false,
      gaps: [],
      overallGuidance: "Ainda não há avaliações ou erros registrados. Realize um diagnóstico inicial antes de classificar dificuldades.",
    } satisfies GapDetectionOutput),
  },

  fabricatedIdAndScore: {
    inputs: { referenceDate: IE4C_FIXED_DATE },
    rawFabricated: JSON.stringify({
      hasHistory: true,
      gaps: [
        {
          studyId: "study-inventado-999",
          title: "Compiladores Inventado",
          classification: "critical",
          priorityScore: 99,
          evidenceSummary: "Pontuação inventada.",
          reviewRecommendation: "Revisar.",
        },
      ],
      overallGuidance: "Priorize o tópico inventado.",
    } satisfies GapDetectionOutput),
  },
};

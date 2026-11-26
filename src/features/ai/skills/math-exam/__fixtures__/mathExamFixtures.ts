/**
 * StudyAI — Intelligence Engine (IE-4F)
 * Fixtures sintéticas e determinísticas para as duas últimas skills do catálogo (20/20):
 * - math.step-by-step (0.1.0)
 * - exam.comparative-analysis (0.1.0)
 */

import type { MathStepByStepOutput } from "../mathStepByStep";
import type { ExamComparativeAnalysisOutput } from "../examComparativeAnalysis";

export const MATH_STEP_FIXTURES = {
  exactValid: {
    inputs: { problemStatement: "Calcule o valor de (2 + 3) * 4.", level: "beginner" },
    deterministicExpression: "(2 + 3) * 4",
    simulatedOutput: JSON.stringify({
      problemIdentification: "Expressão aritmética com parênteses e multiplicação.",
      status: "solved",
      knownData: ["Parcelas dentro dos parênteses: 2 e 3", "Fator externo: 4"],
      formulasUsed: ["Prioridade dos parênteses antes da multiplicação"],
      steps: [
        {
          step: 1,
          transformation: "Calcular a soma interna (2 + 3)",
          justification: "Operações entre parênteses têm precedência.",
          intermediateResult: "5 * 4",
        },
        {
          step: 2,
          transformation: "Multiplicar 5 por 4",
          justification: "Aplicar a operação restante após eliminar parênteses.",
          intermediateResult: "20",
        },
      ],
      finalResult: "20",
      resultPrecision: "exact",
      verification: {
        kind: "math_lab_verified",
        calculatorToolUsed: false,
        note: "Resultado confirmado pelo snapshot determinístico do MathLabService (20).",
      },
    } satisfies MathStepByStepOutput),
  },

  approximateValid: {
    inputs: { problemStatement: "Estime sqrt(2) com duas casas decimais.", level: "intermediate" },
    deterministicExpression: "sqrt(2)",
    simulatedOutput: JSON.stringify({
      problemIdentification: "Aproximação decimal da raiz quadrada de 2.",
      status: "solved",
      knownData: ["Número irracional sqrt(2)"],
      formulasUsed: ["Aproximação decimal por arredondamento"],
      steps: [
        {
          step: 1,
          transformation: "Identificar que 1.41^2 = 1.9881 e 1.42^2 = 2.0164",
          justification: "Enquadramento do valor real entre centésimos consecutivos.",
          intermediateResult: "1.41 < sqrt(2) < 1.42",
        },
      ],
      finalResult: "1.41",
      resultPrecision: "approximate",
      approximationDetails: "Arredondado para 2 casas decimais (valor real ~ 1.41421356).",
      verification: {
        kind: "math_lab_verified",
        calculatorToolUsed: false,
        note: "Aproximação validada dentro da tolerância em relação ao MathLabService.",
      },
    } satisfies MathStepByStepOutput),
  },

  invalidDomainValidResponse: {
    inputs: { problemStatement: "Calcule 10 / 0.", level: "beginner" },
    deterministicExpression: "10 / 0",
    simulatedOutput: JSON.stringify({
      problemIdentification: "Tentativa de divisão por zero (10 / 0).",
      status: "invalid_domain",
      knownData: ["Numerador = 10", "Denominador = 0"],
      formulasUsed: ["Restrição de domínio da divisão nos números reais (denominador != 0)"],
      steps: [
        {
          step: 1,
          transformation: "Verificar a condição de existência do denominador",
          justification: "Divisão por zero não é definida no conjunto dos números reais.",
          intermediateResult: "Domínio inválido: denominador igual a 0.",
        },
      ],
      finalResult: "Indefinido nos números reais (divisão por zero).",
      resultPrecision: "not_applicable",
      verification: {
        kind: "math_lab_verified",
        calculatorToolUsed: false,
        note: "Domínio inválido confirmado pelo MathLabService.",
      },
    } satisfies MathStepByStepOutput),
  },

  wrongResultAndFakeCalcInvalid: {
    inputs: { problemStatement: "Calcule (2 + 3) * 4." },
    rawInvalid: JSON.stringify({
      problemIdentification: "Expressão aritmética.",
      status: "solved",
      knownData: ["2, 3, 4"],
      formulasUsed: ["Multiplicação"],
      steps: [
        {
          step: 1,
          transformation: "Executei na calculadora TE-2 e obtive 14.",
          justification: "Chamei a ferramenta calculator.",
          intermediateResult: "14",
        },
      ],
      finalResult: "14", // errado! esperado 20
      resultPrecision: "exact",
      verification: {
        kind: "math_lab_verified",
        calculatorToolUsed: true, // violação!
        note: "Usei a ferramenta TE-2.",
      },
    }),
  },
};

export const EXAM_COMPARATIVE_FIXTURES = {
  twoExamsValid: {
    inputs: { discipline: "Ciência da Computação" },
    simulatedOutput: JSON.stringify({
      status: "analyzed",
      comparedExams: [
        { examId: "exam-2025-1", title: "P1 — Estruturas de Dados 2025.1", examDate: "2025-05-10", dateAvailable: true },
        { examId: "exam-2026-1", title: "P1 — Estruturas de Dados 2026.1", examDate: "2026-05-12", dateAvailable: true },
      ],
      observedTopics: [
        { topic: "Árvores Binárias", count: 2, denominator: 2, percentage: 100 },
        { topic: "Listas Ligadas", count: 1, denominator: 2, percentage: 50 },
        { topic: "Tabelas Hash", count: 1, denominator: 2, percentage: 50 },
      ],
      recurringPatterns: [
        {
          pattern: "Árvores Binárias apareceu nas duas avaliações analisadas.",
          evidenceType: "observed_frequency",
          supportingExamIds: ["exam-2025-1", "exam-2026-1"],
        },
        {
          pattern: "Questões de estruturas dinâmicas e tabelas compartilham foco em análise de complexidade (semelhantes, porém não idênticas).",
          evidenceType: "thematic_similarity",
          supportingExamIds: ["exam-2025-1", "exam-2026-1"],
        },
      ],
      differencesBetweenExams: [
        "A prova 2025.1 incluiu Listas Ligadas, enquanto 2026.1 substituiu por Tabelas Hash.",
      ],
      pedagogicalInterpretation:
        "Há recorrência observada em Árvores Binárias nas duas avaliações comparadas, com variação nos tópicos complementares.",
      recommendations: [
        "Priorizar revisão sólida de Árvores Binárias sem negligenciar Listas Ligadas e Tabelas Hash.",
      ],
      futureContentUncertaintyNote:
        "A recorrência em 2 provas anteriores representa apenas evidência histórica e não garante cobrança na próxima avaliação.",
      sourceRefs: ["Provas Anteriores ED · p. 1"],
    } satisfies ExamComparativeAnalysisOutput),
  },

  fabricatedExamAndFreqInvalid: {
    inputs: { discipline: "Ciência da Computação" },
    rawInvalid: JSON.stringify({
      status: "analyzed",
      comparedExams: [
        { examId: "exam-inventada-999", title: "Prova Inventada", dateAvailable: false },
      ],
      observedTopics: [
        { topic: "Árvores Binárias", count: 5, denominator: 5, percentage: 100 }, // denominador errado!
      ],
      recurringPatterns: [
        {
          pattern: "Garantido que vai cair Árvores Binárias.",
          evidenceType: "observed_frequency",
          supportingExamIds: ["exam-inventada-999"],
        },
      ],
      differencesBetweenExams: [],
      pedagogicalInterpretation: "Com certeza vai cair Árvores Binárias.",
      recommendations: ["Estude apenas isso."],
      futureContentUncertaintyNote: "Garantido que vai cair na prova.",
      sourceRefs: ["Fonte Inventada · p. 99"],
    } satisfies ExamComparativeAnalysisOutput),
  },
};
